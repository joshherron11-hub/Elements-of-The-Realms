import { err, ok, type Result } from '../core/result';
import type { ActorId, ContractId, LocationId, OwnerRef } from '../core/refs';
import type { ContractService } from '../contracts/contracts';
import type { EconomyService } from '../economy/economy';
import type { InventoryService } from '../economy/inventory';
import type { MarketService } from '../economy/market';
import type { OwnershipService } from '../economy/ownership';
import type { PropertyService } from '../economy/property';
import type { ResourceService } from '../economy/resources';
import type { ActorService } from '../entities/actors';
import type { RelationshipService } from '../entities/social';
import { allowsInteraction } from '../world/constitution';
import { emit, type SimContext } from '../world/context';
import type { InteractionCategory } from '../world/realm';
import type { SearchService } from '../world/search';
import type { WorldService } from '../world/world';
import type { FamiliarService } from '../familiars/familiars';
import type { AuthorityService } from '../entities/organizations';
import type { StallService } from '../economy/stall';
import { pickLine } from '../world/living';
import type { Intent, IntentKind, IntentOutcome, ModeDefinition, ModeKey } from './types';

export interface ModeDeps {
  actors: ActorService;
  world: WorldService;
  inventory: InventoryService;
  economy: EconomyService;
  market: MarketService;
  resources: ResourceService;
  property: PropertyService;
  ownership: OwnershipService;
  relationships: RelationshipService;
  contracts: ContractService;
  search: SearchService;
  familiars: FamiliarService;
  authority: AuthorityService;
  stall: StallService;
}

/** The mode an actor is in when they have not chosen one. */
export const DEFAULT_MODE: ModeKey = 'LIVE';

/** Which interaction category each intent exercises (null = always allowed). */
const INTENT_CATEGORY: Record<IntentKind, InteractionCategory | null> = {
  travel: null,
  talk: 'social',
  buy: 'trade',
  sell: 'trade',
  gather: null,
  search: 'exploration',
  'accept-contract': 'contract',
  'complete-task': 'contract',
  'purchase-property': 'property',
  'familiar-status': 'care',
  'acquire-familiar': 'care',
  'feed-familiar': 'care',
  'rest-familiar': 'care',
  'bond-familiar': 'care',
  'set-stall-listing': 'trade',
};

/**
 * Modes and intents. Translates player intents into kernel service calls,
 * after checking the actor's mode and the server's rules. Holds no gameplay
 * rules of its own beyond "what may be attempted here".
 */
export class ModeService {
  private readonly defs = new Map<ModeKey, ModeDefinition>();

  constructor(
    private readonly ctx: SimContext,
    private readonly deps: ModeDeps,
    definitions: readonly ModeDefinition[],
  ) {
    for (const d of definitions) this.defs.set(d.key, d);
  }

  definitions(): ModeDefinition[] {
    return [...this.defs.values()];
  }

  definition(key: ModeKey): ModeDefinition | undefined {
    return this.defs.get(key);
  }

  current(actorId: ActorId): ModeKey {
    return (this.ctx.state.activeModes[actorId] as ModeKey | undefined) ?? DEFAULT_MODE;
  }

  private allows(category: InteractionCategory | null): boolean {
    if (!category || !this.ctx.rules) return true;
    return allowsInteraction(this.ctx.rules, category);
  }

  canEnter(key: ModeKey): Result<ModeDefinition> {
    const def = this.defs.get(key);
    if (!def) return err('UNKNOWN_MODE', `no mode ${key}`);
    if (def.status !== 'implemented') return err('MODE_NOT_AVAILABLE', `${def.name} is not available yet`);
    const v = this.ctx.rules?.variables;
    if (def.requires?.war && (!v || v.war === 'OFF')) return err('RULES_FORBID', `${def.name} needs a server with war`);
    if (def.requires?.pvp && (!v || v.pvp === 'OFF')) return err('RULES_FORBID', `${def.name} needs a server with PvP`);
    for (const c of def.categories) {
      if (!this.allows(c)) return err('RULES_FORBID', `this server does not allow ${c}`);
    }
    return ok(def);
  }

  enter(actorId: ActorId, key: ModeKey): Result<ModeDefinition> {
    if (!this.ctx.state.actors[actorId]) return err('UNKNOWN_ACTOR', `no actor ${actorId}`);
    const r = this.canEnter(key);
    if (!r.ok) return r;
    const previous = this.current(actorId);
    this.ctx.state.activeModes[actorId] = key;
    emit(this.ctx, 'mode.entered', { actorId, mode: key, previous }, { sourceSystem: 'modes', actor: actorId });
    return r;
  }

  /** Concrete intents the actor could attempt right now in their current mode. */
  available(actorId: ActorId): Intent[] {
    const actor = this.ctx.state.actors[actorId];
    const def = this.defs.get(this.current(actorId));
    if (!actor || !def || !actor.locationId) return [];
    const here = actor.locationId;
    const self: OwnerRef = { kind: 'actor', id: actorId };
    const s = this.ctx.state;
    const out: Intent[] = [];
    const want = (k: IntentKind) => def.intents.includes(k) && this.allows(INTENT_CATEGORY[k]);

    if (want('travel')) for (const { to } of this.deps.world.routesFrom(here)) out.push({ kind: 'travel', to });
    if (want('talk')) for (const a of this.deps.actors.at(here)) if (a.id !== actorId && a.kind !== 'familiar') out.push({ kind: 'talk', with: a.id });
    for (const m of Object.values(s.markets)) {
      if (m.locationId !== here) continue;
      for (const [itemId, l] of Object.entries(m.listings)) {
        if (want('buy') && l.buyable && this.deps.inventory.has(m.vendor, itemId as never, 1)) out.push({ kind: 'buy', marketId: m.id, itemId: itemId as never, quantity: 1 });
        if (want('sell') && l.sellable && this.deps.inventory.has(self, itemId as never, 1)) out.push({ kind: 'sell', marketId: m.id, itemId: itemId as never, quantity: 1 });
      }
    }
    if (want('gather')) for (const n of Object.values(s.resourceNodes)) if (n.locationId === here && n.amount >= 1) out.push({ kind: 'gather', nodeId: n.id, amount: 1 });
    if (want('search')) out.push({ kind: 'search' });
    if (want('accept-contract')) for (const c of this.offersHere(actorId)) out.push({ kind: 'accept-contract', contractId: c.id });
    if (want('complete-task')) {
      for (const c of this.deps.contracts.heldBy(self)) {
        if (c.status !== 'accepted') continue;
        for (const t of this.deps.contracts.tasksOf(c.id)) {
          if (t.status === 'open' && this.deps.contracts.check(t.id, actorId).ok) out.push({ kind: 'complete-task', taskId: t.id });
        }
      }
    }
    if (want('purchase-property')) for (const p of Object.values(s.properties)) if (p.forSale && this.canTransactProperty(here, p.locationId)) out.push({ kind: 'purchase-property', propertyId: p.id });
    const mine = this.deps.familiars.ownedBy(self);
    if (want('familiar-status') && mine.length) out.push({ kind: 'familiar-status' });
    if (want('acquire-familiar')) {
      for (const f of Object.values(s.familiars)) {
        if (f.offer && s.actors[f.actorId]?.locationId === here && !mine.includes(f)) out.push({ kind: 'acquire-familiar', familiarId: f.id });
      }
    }
    for (const f of mine) {
      if (s.actors[f.actorId]?.locationId !== here) continue;
      if (want('feed-familiar')) {
        const diet = this.deps.familiars.species(f)?.diet ?? [];
        for (const [itemId, q] of Object.entries(s.inventories[`actor:${actorId}`]?.stacks ?? {})) {
          if (q > 0 && s.items[itemId]?.tags.some((t) => diet.includes(t))) out.push({ kind: 'feed-familiar', familiarId: f.id, itemId: itemId as never });
        }
      }
      if (want('rest-familiar')) out.push({ kind: 'rest-familiar', familiarId: f.id });
      if (want('bond-familiar')) out.push({ kind: 'bond-familiar', familiarId: f.id });
    }
    return out;
  }

  /**
   * A private interior (a location linked to a property) is open only to
   * those with `property.enter` on it — its owner, or anyone they authorise.
   * Returns the reason it is locked, or undefined if the way is open.
   */
  lockedFor(actorId: ActorId, locationId: string): string | undefined {
    const loc = this.ctx.state.locations[locationId];
    if (!loc?.propertyId) return undefined;
    if (this.deps.authority.can(actorId, 'property.enter', { kind: 'property', id: loc.propertyId })) return undefined;
    const owner = this.deps.ownership.ownerOf({ kind: 'property', id: loc.propertyId });
    const ownerName = owner?.kind === 'actor' ? this.ctx.state.actors[owner.id]?.name : owner ? this.ctx.state.organizations[owner.id]?.name : undefined;
    return `${loc.name} is locked${ownerName ? ` — it belongs to ${ownerName}` : ''}.`;
  }

  /** Is the actor standing in a home they own (an interior of a property they hold)? */
  atOwnHome(actorId: ActorId): boolean {
    const loc = this.ctx.state.locations[this.ctx.state.actors[actorId]?.locationId ?? ''];
    if (!loc?.propertyId) return false;
    const owner = this.deps.ownership.ownerOf({ kind: 'property', id: loc.propertyId });
    return owner?.kind === 'actor' && owner.id === actorId;
  }

  /**
   * What an NPC says when you approach: a line for what they are doing right
   * now, a warmer greeting once they think well of you, else their greeting.
   */
  greetingFor(npcId: ActorId, playerId: ActorId): string | undefined {
    const npc = this.ctx.state.actors[npcId];
    const lines = this.ctx.living.npcLines[npcId];
    const activity = this.ctx.state.npcActivity[npcId]?.activity;
    const rel = this.ctx.state.relationships[`${npcId}->${playerId}`];
    if (activity && lines?.activities?.[activity]) return lines.activities[activity];
    if (rel && rel.regard >= 15 && lines?.friendly) return lines.friendly;
    return npc?.profile?.greeting;
  }

  /**
   * Property can be bought where it stands, or at a civic office (a location
   * tagged 'civic', where deeds are recorded) in the same settlement.
   */
  canTransactProperty(here: LocationId, propertyAt: LocationId): boolean {
    if (here === propertyAt) return true;
    const loc = this.ctx.state.locations[here];
    if (!loc?.tags.includes('civic') || !loc.parentId) return false;
    return this.deps.world.isWithin(propertyAt, loc.parentId);
  }

  /** Offered contracts the actor can take up here, filtered by the mode's contract kinds. */
  offersHere(actorId: ActorId, issuer?: ActorId) {
    const actor = this.ctx.state.actors[actorId];
    const def = this.defs.get(this.current(actorId));
    if (!actor?.locationId || !def) return [];
    return this.deps.contracts.available().filter((c) => {
      if (def.contractKinds && !def.contractKinds.includes(c.kind)) return false;
      if (issuer) return c.issuer.kind === 'actor' && c.issuer.id === issuer;
      const issuerHere = c.issuer.kind === 'actor' && this.ctx.state.actors[c.issuer.id]?.locationId === actor.locationId;
      return issuerHere || c.locationId === actor.locationId;
    });
  }

  private bark(vendor: OwnerRef | undefined, key: string): string | null {
    if (vendor?.kind !== 'actor') return null;
    return pickLine(this.ctx.living.npcLines[vendor.id]?.barks, key) ?? null;
  }

  /** Attempt an intent. Checks mode and rules, then delegates to the owning service. */
  perform(actorId: ActorId, intent: Intent): Result<IntentOutcome> {
    const actor = this.ctx.state.actors[actorId];
    if (!actor) return err('UNKNOWN_ACTOR', `no actor ${actorId}`);
    const def = this.defs.get(this.current(actorId));
    if (!def || !def.intents.includes(intent.kind)) return err('NOT_IN_MODE', `${intent.kind} is not available in ${def?.name ?? 'this mode'}`);
    if (!this.allows(INTENT_CATEGORY[intent.kind])) return err('RULES_FORBID', `this server does not allow ${INTENT_CATEGORY[intent.kind]}`);
    const self: OwnerRef = { kind: 'actor', id: actorId };
    const d = this.deps;
    const done = (summary: string, data?: Record<string, unknown>): Result<IntentOutcome> => ok({ kind: intent.kind, summary, data });

    switch (intent.kind) {
      case 'travel': {
        const locked = this.lockedFor(actorId, intent.to);
        if (locked) return err('LOCKED', locked);
        const r = d.world.travel(actorId, intent.to);
        return r.ok ? done(`Travelled to ${this.ctx.state.locations[intent.to]?.name ?? intent.to}`, { path: r.value }) : r;
      }
      case 'talk': {
        const other = this.ctx.state.actors[intent.with];
        if (!other) return err('UNKNOWN_ACTOR', `no actor ${intent.with}`);
        if (other.locationId !== actor.locationId) return err('NOT_PRESENT', `${other.name} is not here`);
        d.relationships.adjust(actorId, other.id, { familiarity: 2 }, 'conversation');
        d.relationships.adjust(other.id, actorId, { familiarity: 2 }, 'conversation', { chronicle: false });
        emit(this.ctx, 'social.talked', { with: other.id }, { sourceSystem: 'social', actor: actorId, participants: [other.id], location: actor.locationId, evidence: true });
        const offers = this.offersHere(actorId, other.id).map((c) => ({ contractId: c.id, title: c.title, kind: c.kind }));
        return done(`Spoke with ${other.name}`, { with: other.id, offers, greeting: this.greetingFor(other.id, actorId) ?? null, lines: other.profile?.lines ?? [], activity: this.ctx.state.npcActivity[other.id]?.activity ?? null });
      }
      case 'buy': {
        const m = this.ctx.state.markets[intent.marketId];
        if (m?.locationId && actor.locationId !== m.locationId) return err('NOT_PRESENT', 'you are not at that market');
        const r = d.market.buy(self, intent.marketId, intent.itemId, intent.quantity);
        if (!r.ok) return r;
        return done(`Bought ${intent.quantity} × ${this.ctx.state.items[intent.itemId]?.name ?? intent.itemId} for ${r.value.total}`, { trade: r.value, bark: this.bark(m?.vendor, `${intent.itemId}:${this.ctx.clock.now()}`) });
      }
      case 'sell': {
        const m = this.ctx.state.markets[intent.marketId];
        if (m?.locationId && actor.locationId !== m.locationId) return err('NOT_PRESENT', 'you are not at that market');
        const r = d.market.sell(self, intent.marketId, intent.itemId, intent.quantity);
        return r.ok ? done(`Sold ${intent.quantity} × ${this.ctx.state.items[intent.itemId]?.name ?? intent.itemId} for ${r.value.total}`, { trade: r.value, bark: this.bark(m?.vendor, `sell:${intent.itemId}:${this.ctx.clock.now()}`) }) : r;
      }
      case 'gather': {
        const node = this.ctx.state.resourceNodes[intent.nodeId];
        if (node && node.locationId !== actor.locationId) return err('NOT_PRESENT', 'that is not here');
        const r = d.resources.gather(self, intent.nodeId, intent.amount);
        return r.ok ? done(`Gathered ${r.value}`, { amount: r.value }) : r;
      }
      case 'search': {
        const r = d.search.search(actorId);
        if (!r.ok) return r;
        return done(r.value.found.length ? r.value.found.map((f) => f.description).join(' ') : 'You find nothing of note.', { found: r.value.found });
      }
      case 'accept-contract': {
        const c = d.contracts.get(intent.contractId);
        if (!c) return err('UNKNOWN_CONTRACT', `no contract ${intent.contractId}`);
        if (def.contractKinds && !def.contractKinds.includes(c.kind)) return err('NOT_IN_MODE', `${def.name} does not take ${c.kind} contracts`);
        if (c.kind === 'investment' && !this.allows('investment')) return err('RULES_FORBID', 'this server does not allow investment');
        if (!this.offersHere(actorId).some((o) => o.id === c.id)) return err('NOT_PRESENT', 'that offer is not available here');
        const r = d.contracts.accept(intent.contractId, self);
        if (!r.ok) return r;
        this.ctx.state.flags[`contract:${c.id}:${actorId}`] = true;
        return done(`Accepted: ${c.title}`, { contractId: c.id });
      }
      case 'complete-task': {
        const r = d.contracts.completeTask(intent.taskId, actorId);
        if (!r.ok) return r;
        const s = r.value.settlement;
        if (s) delete this.ctx.state.flags[`contract:${s.contract.id}:${actorId}`];
        return done(s ? `${s.contract.title}: ${s.outcome}` : `Done: ${r.value.task.title}`, { task: r.value.task.id, settlement: s ? { contractId: s.contract.id as ContractId, outcome: s.outcome, stakeReturned: s.stakeReturned } : undefined });
      }
      case 'purchase-property': {
        const prop = this.ctx.state.properties[intent.propertyId];
        if (prop && (!actor.locationId || !this.canTransactProperty(actor.locationId, prop.locationId))) {
          return err('NOT_PRESENT', 'deeds are signed at the property or at the civic office');
        }
        const r = d.property.purchase(self, intent.propertyId);
        return r.ok ? done(`You now own ${r.value.name}`, { propertyId: r.value.id }) : r;
      }
      case 'familiar-status': {
        const familiars = d.familiars.ownedBy(self).map((f) => d.familiars.status(f.id)).filter((r) => r.ok).map((r) => r.value);
        return done(
          familiars.length ? familiars.map((f) => `${f.name} the ${f.form}: bond ${Math.round(f.bond)}, ${f.notes.join(', ')}`).join(' · ') : 'You have no Familiars.',
          { familiars },
        );
      }
      case 'acquire-familiar': {
        const f = this.ctx.state.familiars[intent.familiarId];
        if (f && this.ctx.state.actors[f.actorId]?.locationId !== actor.locationId) return err('NOT_PRESENT', `${f.name} is not here`);
        const r = d.familiars.acquire(self, intent.familiarId);
        return r.ok ? done(d.familiars.reaction(r.value, 'acquired') ?? `${r.value.name} is yours now. Look after them.`, { familiarId: r.value.id }) : r;
      }
      case 'feed-familiar': {
        const r = d.familiars.feed(self, intent.familiarId, intent.itemId);
        return r.ok ? done(`${d.familiars.reaction(r.value, 'fed') ?? `${r.value.name} eats happily.`} (fed ${Math.round(r.value.care.satiety)}/100)`, { familiarId: r.value.id }) : r;
      }
      case 'rest-familiar': {
        const home = this.atOwnHome(actorId);
        const r = d.familiars.rest(self, intent.familiarId, { atHome: home });
        if (!r.ok) return r;
        const line = d.familiars.reaction(r.value, home ? 'home' : 'rested') ?? `${r.value.name} naps.`;
        return done(`${line} (energy ${Math.round(r.value.care.energy)}/100)`, { familiarId: r.value.id, atHome: home });
      }
      case 'bond-familiar': {
        const r = d.familiars.bond(self, intent.familiarId);
        return r.ok ? done(`${d.familiars.reaction(r.value, 'bonded') ?? `You and ${r.value.name} spend a while together.`} (bond ${Math.round(r.value.bond)})`, { familiarId: r.value.id }) : r;
      }
      case 'set-stall-listing': {
        const prop = this.ctx.state.properties[intent.propertyId];
        if (prop && actor.locationId !== prop.locationId) return err('NOT_PRESENT', `you need to be at ${prop.name}`);
        const r = d.stall.setListing(self, intent.propertyId, intent.itemId, intent.price);
        if (!r.ok) return r;
        const item = this.ctx.state.items[intent.itemId]?.name ?? intent.itemId;
        return done(intent.price === null ? `Took ${item} off your stall.` : `${item} is on your stall at ${intent.price}.`, { propertyId: intent.propertyId });
      }
    }
  }
}

