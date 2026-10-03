import { err, ok, type Result } from '../core/result';
import type { ActorId, ContractId, OwnerRef } from '../core/refs';
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
    if (want('purchase-property')) for (const p of Object.values(s.properties)) if (p.forSale && p.locationId === here) out.push({ kind: 'purchase-property', propertyId: p.id });
    if (want('familiar-status') && this.deps.ownership.assetsOf(self, 'familiar').length) out.push({ kind: 'familiar-status' });
    return out;
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
        return done(`Spoke with ${other.name}`, { with: other.id, offers, greeting: other.profile?.greeting ?? null, lines: other.profile?.lines ?? [] });
      }
      case 'buy': {
        const m = this.ctx.state.markets[intent.marketId];
        if (m?.locationId && actor.locationId !== m.locationId) return err('NOT_PRESENT', 'you are not at that market');
        const r = d.market.buy(self, intent.marketId, intent.itemId, intent.quantity);
        if (!r.ok) return r;
        return done(`Bought ${intent.quantity} × ${this.ctx.state.items[intent.itemId]?.name ?? intent.itemId} for ${r.value.total}`, { trade: r.value });
      }
      case 'sell': {
        const m = this.ctx.state.markets[intent.marketId];
        if (m?.locationId && actor.locationId !== m.locationId) return err('NOT_PRESENT', 'you are not at that market');
        const r = d.market.sell(self, intent.marketId, intent.itemId, intent.quantity);
        return r.ok ? done(`Sold ${intent.quantity} × ${this.ctx.state.items[intent.itemId]?.name ?? intent.itemId} for ${r.value.total}`, { trade: r.value }) : r;
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
        const r = d.property.purchase(self, intent.propertyId);
        return r.ok ? done(`You now own ${r.value.name}`, { propertyId: r.value.id }) : r;
      }
      case 'familiar-status': {
        const familiars = d.ownership
          .assetsOf(self, 'familiar')
          .map((a) => this.ctx.state.familiars[a.id])
          .filter((f) => f !== undefined)
          .map((f) => ({ id: f.id, name: f.name, species: f.species, bond: f.bond, care: { ...f.care } }));
        return done(familiars.length ? familiars.map((f) => `${f.name} (bond ${f.bond})`).join(', ') : 'You have no Familiars.', { familiars });
      }
    }
  }
}

