import type { Clock } from './core/clock';
import type { IdFactory } from './core/ids';
import { err, ok, type Result } from './core/result';
import type { ActorId, CurrencyId, LocationId, OrganizationId, PersonId, RealmId } from './core/refs';
import { provenance } from './core/provenance';
import type { ModeDefinition } from './modes/types';
import { Simulation } from './simulation';
import type { ResolvedRules } from './world/constitution';
import { validatePack, type ContentPack } from './world/content-pack';
import { createWorldState } from './world/world-state';
import type { Actor } from './entities/actor';

/**
 * Apply a validated content pack to a world through the ordinary services,
 * so seeded coin is minted on the ledger, seeded ownership is registered,
 * seeded contracts are offered — exactly as if they had happened in play.
 */
export function applyContentPack(sim: Simulation, pack: ContentPack): void {
  const s = sim.state;
  const now = sim.ctx.clock.now();
  const authored = provenance('authored', `content:${pack.id}`, now, { realmId: s.realm.id });
  const primary = (sim.ctx.rules?.realm.constitution.economy.primaryCurrency ?? pack.currencies[0]?.id) as CurrencyId | undefined;

  for (const c of pack.currencies) s.currencies[c.id] = { ...c, id: c.id as never, realmId: s.realm.id };
  for (const i of pack.items) s.items[i.id] = { ...i, id: i.id as never, originRealmId: s.realm.id };
  for (const r of pack.resources) s.resources[r.id] = { ...r, id: r.id as never, yieldsItemId: r.yieldsItemId as never };
  for (const l of pack.locations) s.locations[l.id] = { ...l, id: l.id as never, realmId: s.realm.id, kind: l.kind as never, parentId: l.parentId as never };
  for (const r of pack.routes) s.routes[r.id] = { ...r, id: r.id as never, from: r.from as never, to: r.to as never, kind: r.kind as never, status: r.status as never };
  for (const r of pack.risks) s.risks[r.id] = { ...r, id: r.id as never };

  const seedCoin = (holder: Parameters<typeof sim.economy.mint>[0], amount: number) => {
    if (amount > 0 && primary) sim.economy.mint(holder, primary, amount, { reason: 'seeded', sourceSystem: `content:${pack.id}` });
  };

  for (const a of pack.actors) {
    const created = sim.actors.create({ id: a.id as ActorId, kind: a.kind, name: a.name, locationId: a.locationId as LocationId | undefined, tags: a.tags, profile: a.profile, provenance: authored });
    if (!created.ok) throw new Error(`content ${pack.id}: ${created.error.message}`);
    seedCoin({ kind: 'actor', id: a.id as ActorId }, a.purse);
    for (const [itemId, q] of Object.entries(a.inventory)) sim.inventory.add({ kind: 'actor', id: a.id as ActorId }, itemId as never, q, 'seeded');
  }
  for (const r of pack.roles) s.roles[r.id] = { ...r, id: r.id as never, organizationId: r.organizationId as never };
  for (const o of pack.organizations) {
    s.organizations[o.id] = {
      id: o.id as OrganizationId,
      kind: o.kind as never,
      name: o.name,
      realmId: s.realm.id,
      domain: o.domain,
      members: Object.fromEntries(o.members.map((m) => [m.actorId, { roleIds: m.roleIds as never[], joinedAt: now }])),
      tags: o.tags,
      provenance: authored,
    };
    seedCoin({ kind: 'organization', id: o.id as OrganizationId }, o.purse);
  }
  for (const m of pack.markets) {
    s.markets[m.id] = { ...m, id: m.id as never, locationId: m.locationId as never, currencyId: (m.currencyId ?? primary) as never, drift: m.drift ? { riskProfileId: m.drift.riskProfileId as never, everyMs: m.drift.everyMs } : undefined };
  }
  for (const n of pack.resourceNodes) s.resourceNodes[n.id] = { ...n, id: n.id as never, resourceId: n.resourceId as never, locationId: n.locationId as never };
  for (const p of pack.properties) {
    s.properties[p.id] = { id: p.id as never, name: p.name, kind: p.kind as never, locationId: p.locationId as never, value: p.value, currencyId: (p.currencyId ?? primary) as never, forSale: p.forSale, tags: p.tags, provenance: authored };
    if (p.owner) sim.ownership.register({ kind: 'property', id: p.id }, p.owner, authored, 'founded');
  }
  for (const c of pack.contracts) {
    sim.contracts.offer({ id: c.id as never, kind: c.kind, title: c.title, description: c.description, domain: c.domain, issuer: c.issuer, tasks: c.tasks, terms: c.terms, locationId: c.locationId as never, tags: c.tags, provenance: authored });
  }
  for (const sp of pack.searchSpots) s.searchSpots[sp.id] = { ...sp, foundBy: [] };
  for (const h of pack.happenings) s.happenings[h.id] = { ...h, seenBy: [] };
  for (const sp of pack.familiarSpecies) s.familiarSpecies[sp.id] = { ...sp };
  for (const f of pack.familiars) {
    const made = sim.familiars.create({ ...f, id: f.id as never, provenance: authored });
    if (!made.ok) throw new Error(`content ${pack.id}: ${made.error.message}`);
  }
}

export interface BootstrapOptions {
  rules: ResolvedRules;
  pack: ContentPack;
  modes: readonly ModeDefinition[];
  seed: number;
  clock?: Clock;
  ids?: IdFactory;
}

/** Create a fresh world for a server: empty state → validated content → running simulation. */
export function bootstrapWorld(opts: BootstrapOptions): Result<Simulation> {
  const valid = validatePack(opts.pack, opts.rules.realm);
  if (!valid.ok) return valid;
  const realm = opts.rules.realm;
  const server = opts.rules.server;
  const now = opts.clock?.now() ?? 0;
  const state = createWorldState({
    realm: { id: realm.id, name: realm.name, type: realm.type },
    server: { id: server.id, name: server.name, preset: server.preset },
    seed: opts.seed,
    now,
  });
  const sim = new Simulation({ state, clock: opts.clock, ids: opts.ids, rules: opts.rules, modes: opts.modes }).start();
  applyContentPack(sim, opts.pack);
  return ok(sim);
}

export interface JoinOptions {
  displayName: string;
  actorName?: string;
  startAt: LocationId;
  personId?: PersonId;
}

/**
 * A person enters a Realm: a Person (if new), a REALM identity, an actor in
 * this Realm and the Realm's starting purse.
 */
export function joinRealm(sim: Simulation, opts: JoinOptions): Result<{ personId: PersonId; actor: Actor }> {
  const s = sim.state;
  if (!s.locations[opts.startAt]) return err('UNKNOWN_LOCATION', `no location ${opts.startAt}`);
  const person = (opts.personId && s.persons[opts.personId]) || sim.identity.createPerson(opts.displayName, opts.personId);
  if (person.actors[s.realm.id]) return err('ALREADY_JOINED', `${person.displayName} already lives in ${s.realm.name}`);
  const identity = sim.identity.createIdentity(person.id, 'REALM', { displayName: opts.actorName ?? opts.displayName, realmId: s.realm.id as RealmId });
  if (!identity.ok) return identity;
  const actor = sim.actors.create({ kind: 'player', name: opts.actorName ?? opts.displayName, personId: person.id, locationId: opts.startAt });
  if (!actor.ok) return actor;
  const eco = sim.ctx.rules?.realm.constitution.economy;
  if (eco && eco.startingPurse > 0) {
    sim.economy.mint({ kind: 'actor', id: actor.value.id }, eco.primaryCurrency, eco.startingPurse, { reason: 'starting purse', sourceSystem: 'realm' });
  }
  sim.chronicle.record({ event: 'realm.joined', actor: actor.value.id, location: opts.startAt, sourceSystem: 'realm', summary: `Arrived in ${s.realm.name}`, outcome: 'arrived' });
  sim.world.discover(actor.value.id, opts.startAt);
  return ok({ personId: person.id, actor: actor.value });
}
