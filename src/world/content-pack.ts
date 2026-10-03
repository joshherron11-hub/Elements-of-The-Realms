import { err, ok, type Result } from '../core/result';
import { Validator, rankOf } from '../core/schema';
import type { OwnerRef, ScopeRef } from '../core/refs';
import type { Reward, TaskRequirement, ContractTerms } from '../contracts/types';
import type { SearchSpot } from './search';
import type { Happening } from './happenings';
import { MAGIC_SCALE, TECHNOLOGY_SCALE, type RealmDefinition } from './realm';

/**
 * CONTENT PACKS
 *
 * A content pack is authored JSON describing a slice of a Realm: currencies,
 * items, places, routes, people, markets, properties, risks, contracts and
 * hidden finds. Packs are validated (structure, references, Realm ceiling)
 * and then applied to a world through the ordinary kernel services, so
 * seeded content obeys exactly the same rules as play.
 *
 * Adding an NPC, item or contract = editing JSON. No kernel code changes.
 */
export interface PackCurrency { id: string; name: string; symbol: string; minorPerMajor: number }
export interface PackItem { id: string; name: string; category: string; tags: string[]; baseValue: number; stackable: boolean; techTier?: string; magicTier?: string; description?: string }
export interface PackResource { id: string; name: string; yieldsItemId: string }
export interface PackLocation { id: string; name: string; kind: string; parentId?: string; tags: string[]; sceneKey?: string; description?: string }
export interface PackRoute { id: string; from: string; to: string; kind: string; travelTimeMs: number; status: string; bidirectional: boolean; tags: string[] }
export interface PackActor { id: string; kind: 'npc' | 'familiar' | 'system'; name: string; locationId?: string; tags: string[]; purse: number; inventory: Record<string, number>; profile?: { title?: string; description?: string; greeting?: string; lines?: string[] } }
export interface PackOrganization { id: string; kind: string; name: string; domain: 'PLAY' | 'LEARN' | 'WORK' | 'CREATE'; members: { actorId: string; roleIds: string[] }[]; tags: string[]; purse: number }
export interface PackRole { id: string; organizationId: string; name: string; permissions: string[] }
export interface PackMarket { id: string; name: string; locationId?: string; vendor: OwnerRef; currencyId?: string; priceIndex: number; drift?: { riskProfileId: string; everyMs: number }; listings: Record<string, { basePrice: number; buyable: boolean; sellable: boolean; sellSpread: number }> }
export interface PackResourceNode { id: string; resourceId: string; locationId: string; amount: number; capacity: number; regenPerHour: number }
export interface PackProperty { id: string; name: string; kind: string; locationId: string; value: number; currencyId?: string; forSale: boolean; owner?: OwnerRef; tags: string[] }
export interface PackRisk { id: string; name: string; category: string; outcomes: { key: string; label: string; weight: number; valueMultiplier: number }[] }
export interface PackContract { id: string; kind: string; title: string; description: string; domain: 'PLAY' | 'LEARN' | 'WORK' | 'CREATE'; issuer: OwnerRef; tasks: { title: string; requirement: TaskRequirement }[]; terms: ContractTerms; locationId?: string; tags: string[] }

export interface ContentPack {
  id: string;
  realmId: string;
  currencies: PackCurrency[];
  items: PackItem[];
  resources: PackResource[];
  locations: PackLocation[];
  routes: PackRoute[];
  actors: PackActor[];
  organizations: PackOrganization[];
  roles: PackRole[];
  markets: PackMarket[];
  resourceNodes: PackResourceNode[];
  properties: PackProperty[];
  risks: PackRisk[];
  contracts: PackContract[];
  searchSpots: Omit<SearchSpot, 'foundBy'>[];
  happenings: Omit<Happening, 'seenBy'>[];
}

const LISTS = ['currencies', 'items', 'resources', 'locations', 'routes', 'actors', 'organizations', 'roles', 'markets', 'resourceNodes', 'properties', 'risks', 'contracts', 'searchSpots', 'happenings'] as const;

const LOCATION_KINDS = ['region', 'settlement', 'district', 'building', 'room', 'wilderness', 'road'] as const;
const ROUTE_KINDS = ['path', 'road', 'river', 'sea', 'portal'] as const;
const ROUTE_STATUS = ['open', 'closed', 'hazardous'] as const;
const PROPERTY_KINDS = ['plot', 'house', 'shop', 'farm', 'stall', 'warehouse', 'land'] as const;
const ORG_KINDS = ['organization', 'faction', 'clan', 'guild', 'household', 'government', 'company', 'team', 'school'] as const;
const DOMAINS = ['PLAY', 'LEARN', 'WORK', 'CREATE'] as const;
const SCOPE_KINDS = ['realm', 'server', 'location', 'property', 'organization'] as const;

function owner(v: Validator, raw: unknown, p: string): OwnerRef {
  const o = v.obj(raw, p);
  return { kind: v.oneOf(o.kind, ['actor', 'organization'] as const, `${p}.kind`), id: v.str(o.id, `${p}.id`) } as OwnerRef;
}

function int(v: Validator, raw: unknown, p: string, min = 0): number {
  const n = v.num(raw, p, min);
  if (!Number.isInteger(n)) v.fail(p, 'expected a whole number');
  return n;
}

function requirement(v: Validator, raw: unknown, p: string): TaskRequirement {
  const o = v.obj(raw, p);
  const kind = v.oneOf(o.kind, ['deliver', 'acquire', 'visit', 'talk', 'wait', 'custom'] as const, `${p}.kind`);
  switch (kind) {
    case 'deliver':
      return { kind, itemId: v.str(o.itemId, `${p}.itemId`) as never, quantity: int(v, o.quantity, `${p}.quantity`, 1), to: v.str(o.to, `${p}.to`) as never };
    case 'acquire':
      return { kind, itemId: v.str(o.itemId, `${p}.itemId`) as never, quantity: int(v, o.quantity, `${p}.quantity`, 1) };
    case 'visit':
      return { kind, locationId: v.str(o.locationId, `${p}.locationId`) as never };
    case 'talk':
      return { kind, actorId: v.str(o.actorId, `${p}.actorId`) as never };
    case 'wait':
      return { kind, durationMs: int(v, o.durationMs, `${p}.durationMs`, 1) };
    case 'custom':
      return { kind, key: v.str(o.key, `${p}.key`) };
  }
}

function reward(v: Validator, raw: unknown, p: string): Reward {
  const o = v.obj(raw, p);
  const kind = v.oneOf(o.kind, ['currency', 'item', 'reputation', 'relationship'] as const, `${p}.kind`);
  switch (kind) {
    case 'currency':
      return { kind, currencyId: v.str(o.currencyId, `${p}.currencyId`) as never, amount: int(v, o.amount, `${p}.amount`, 1) };
    case 'item':
      return { kind, itemId: v.str(o.itemId, `${p}.itemId`) as never, quantity: int(v, o.quantity, `${p}.quantity`, 1) };
    case 'reputation': {
      const s = v.obj(o.scope, `${p}.scope`);
      const scope: ScopeRef = { kind: v.oneOf(s.kind, SCOPE_KINDS, `${p}.scope.kind`), id: v.optStr(s.id, `${p}.scope.id`) };
      return { kind, scope, amount: v.num(o.amount, `${p}.amount`, -100, 100) };
    }
    case 'relationship':
      return {
        kind,
        with: v.str(o.with, `${p}.with`) as never,
        regard: o.regard === undefined ? undefined : v.num(o.regard, `${p}.regard`, -100, 100),
        trust: o.trust === undefined ? undefined : v.num(o.trust, `${p}.trust`, -100, 100),
      };
  }
}

/** Parse one pack file. Structural checks only; see validatePack for references. */
export function parseContentPack(raw: unknown, source = 'pack'): Result<ContentPack> {
  const v = new Validator(source);
  const o = v.obj(raw, '');
  v.noExtraKeys(o, ['id', 'realmId', ...LISTS], '');
  const list = <T>(key: (typeof LISTS)[number], f: (x: Record<string, unknown>, p: string) => T): T[] =>
    o[key] === undefined ? [] : v.arr(o[key], key, (x, p) => f(v.obj(x, p), p));

  const pack: ContentPack = {
    id: v.str(o.id, 'id'),
    realmId: v.str(o.realmId, 'realmId'),
    currencies: list('currencies', (x, p) => ({ id: v.str(x.id, `${p}.id`), name: v.str(x.name, `${p}.name`), symbol: v.str(x.symbol, `${p}.symbol`), minorPerMajor: int(v, x.minorPerMajor ?? 1, `${p}.minorPerMajor`, 1) })),
    items: list('items', (x, p) => ({
      id: v.str(x.id, `${p}.id`),
      name: v.str(x.name, `${p}.name`),
      category: v.str(x.category, `${p}.category`),
      tags: x.tags === undefined ? [] : v.arr(x.tags, `${p}.tags`, (t, tp) => v.str(t, tp)),
      baseValue: int(v, x.baseValue, `${p}.baseValue`),
      stackable: x.stackable === undefined ? true : v.bool(x.stackable, `${p}.stackable`),
      techTier: x.techTier === undefined ? undefined : v.oneOf(x.techTier, TECHNOLOGY_SCALE, `${p}.techTier`),
      magicTier: x.magicTier === undefined ? undefined : v.oneOf(x.magicTier, MAGIC_SCALE, `${p}.magicTier`),
      description: v.optStr(x.description, `${p}.description`),
    })),
    resources: list('resources', (x, p) => ({ id: v.str(x.id, `${p}.id`), name: v.str(x.name, `${p}.name`), yieldsItemId: v.str(x.yieldsItemId, `${p}.yieldsItemId`) })),
    locations: list('locations', (x, p) => ({
      id: v.str(x.id, `${p}.id`),
      name: v.str(x.name, `${p}.name`),
      kind: v.oneOf(x.kind, LOCATION_KINDS, `${p}.kind`),
      parentId: v.optStr(x.parentId, `${p}.parentId`),
      tags: x.tags === undefined ? [] : v.arr(x.tags, `${p}.tags`, (t, tp) => v.str(t, tp)),
      sceneKey: v.optStr(x.sceneKey, `${p}.sceneKey`),
      description: v.optStr(x.description, `${p}.description`),
    })),
    routes: list('routes', (x, p) => ({
      id: v.str(x.id, `${p}.id`),
      from: v.str(x.from, `${p}.from`),
      to: v.str(x.to, `${p}.to`),
      kind: v.oneOf(x.kind ?? 'road', ROUTE_KINDS, `${p}.kind`),
      travelTimeMs: int(v, x.travelTimeMs, `${p}.travelTimeMs`, 1),
      status: v.oneOf(x.status ?? 'open', ROUTE_STATUS, `${p}.status`),
      bidirectional: x.bidirectional === undefined ? true : v.bool(x.bidirectional, `${p}.bidirectional`),
      tags: x.tags === undefined ? [] : v.arr(x.tags, `${p}.tags`, (t, tp) => v.str(t, tp)),
    })),
    actors: list('actors', (x, p) => {
      const inv = x.inventory === undefined ? {} : v.obj(x.inventory, `${p}.inventory`);
      return {
        id: v.str(x.id, `${p}.id`),
        kind: v.oneOf(x.kind ?? 'npc', ['npc', 'familiar', 'system'] as const, `${p}.kind`),
        name: v.str(x.name, `${p}.name`),
        locationId: v.optStr(x.locationId, `${p}.locationId`),
        tags: x.tags === undefined ? [] : v.arr(x.tags, `${p}.tags`, (t, tp) => v.str(t, tp)),
        purse: int(v, x.purse ?? 0, `${p}.purse`),
        inventory: Object.fromEntries(Object.entries(inv).map(([k, q]) => [k, int(v, q, `${p}.inventory.${k}`, 1)])),
        profile: x.profile === undefined ? undefined : (() => {
          const po = v.obj(x.profile, `${p}.profile`);
          v.noExtraKeys(po, ['title', 'description', 'greeting', 'lines'], `${p}.profile`);
          return {
            title: v.optStr(po.title, `${p}.profile.title`),
            description: v.optStr(po.description, `${p}.profile.description`),
            greeting: v.optStr(po.greeting, `${p}.profile.greeting`),
            lines: po.lines === undefined ? undefined : v.arr(po.lines, `${p}.profile.lines`, (l, lp) => v.str(l, lp)),
          };
        })(),
      };
    }),
    organizations: list('organizations', (x, p) => ({
      id: v.str(x.id, `${p}.id`),
      kind: v.oneOf(x.kind, ORG_KINDS, `${p}.kind`),
      name: v.str(x.name, `${p}.name`),
      domain: v.oneOf(x.domain ?? 'PLAY', DOMAINS, `${p}.domain`),
      members: x.members === undefined ? [] : v.arr(x.members, `${p}.members`, (m, mp) => {
        const mo = v.obj(m, mp);
        return { actorId: v.str(mo.actorId, `${mp}.actorId`), roleIds: mo.roleIds === undefined ? [] : v.arr(mo.roleIds, `${mp}.roleIds`, (r, rp) => v.str(r, rp)) };
      }),
      tags: x.tags === undefined ? [] : v.arr(x.tags, `${p}.tags`, (t, tp) => v.str(t, tp)),
      purse: int(v, x.purse ?? 0, `${p}.purse`),
    })),
    roles: list('roles', (x, p) => ({ id: v.str(x.id, `${p}.id`), organizationId: v.str(x.organizationId, `${p}.organizationId`), name: v.str(x.name, `${p}.name`), permissions: v.arr(x.permissions, `${p}.permissions`, (t, tp) => v.str(t, tp)) })),
    markets: list('markets', (x, p) => {
      const listings = v.obj(x.listings, `${p}.listings`);
      return {
        id: v.str(x.id, `${p}.id`),
        name: v.str(x.name, `${p}.name`),
        locationId: v.optStr(x.locationId, `${p}.locationId`),
        vendor: owner(v, x.vendor, `${p}.vendor`),
        currencyId: v.optStr(x.currencyId, `${p}.currencyId`),
        priceIndex: x.priceIndex === undefined ? 1 : v.num(x.priceIndex, `${p}.priceIndex`, 0.2, 5),
        drift: x.drift === undefined ? undefined : (() => {
          const d = v.obj(x.drift, `${p}.drift`);
          return { riskProfileId: v.str(d.riskProfileId, `${p}.drift.riskProfileId`), everyMs: int(v, d.everyMs, `${p}.drift.everyMs`, 1000) };
        })(),
        listings: Object.fromEntries(
          Object.entries(listings).map(([itemId, l]) => {
            const lp = `${p}.listings.${itemId}`;
            const lo = v.obj(l, lp);
            return [itemId, {
              basePrice: int(v, lo.basePrice, `${lp}.basePrice`, 1),
              buyable: lo.buyable === undefined ? true : v.bool(lo.buyable, `${lp}.buyable`),
              sellable: lo.sellable === undefined ? false : v.bool(lo.sellable, `${lp}.sellable`),
              sellSpread: lo.sellSpread === undefined ? 0.4 : v.num(lo.sellSpread, `${lp}.sellSpread`, 0, 1),
            }];
          }),
        ),
      };
    }),
    resourceNodes: list('resourceNodes', (x, p) => ({ id: v.str(x.id, `${p}.id`), resourceId: v.str(x.resourceId, `${p}.resourceId`), locationId: v.str(x.locationId, `${p}.locationId`), amount: v.num(x.amount, `${p}.amount`, 0), capacity: v.num(x.capacity, `${p}.capacity`, 0), regenPerHour: v.num(x.regenPerHour ?? 0, `${p}.regenPerHour`, 0) })),
    properties: list('properties', (x, p) => ({
      id: v.str(x.id, `${p}.id`),
      name: v.str(x.name, `${p}.name`),
      kind: v.oneOf(x.kind, PROPERTY_KINDS, `${p}.kind`),
      locationId: v.str(x.locationId, `${p}.locationId`),
      value: int(v, x.value, `${p}.value`, 1),
      currencyId: v.optStr(x.currencyId, `${p}.currencyId`),
      forSale: v.bool(x.forSale, `${p}.forSale`),
      owner: x.owner === undefined ? undefined : owner(v, x.owner, `${p}.owner`),
      tags: x.tags === undefined ? [] : v.arr(x.tags, `${p}.tags`, (t, tp) => v.str(t, tp)),
    })),
    risks: list('risks', (x, p) => ({
      id: v.str(x.id, `${p}.id`),
      name: v.str(x.name, `${p}.name`),
      category: v.str(x.category, `${p}.category`),
      outcomes: v.arr(x.outcomes, `${p}.outcomes`, (oc, op) => {
        const oo = v.obj(oc, op);
        return { key: v.str(oo.key, `${op}.key`), label: v.str(oo.label, `${op}.label`), weight: v.num(oo.weight, `${op}.weight`, 0), valueMultiplier: v.num(oo.valueMultiplier, `${op}.valueMultiplier`, 0, 100) };
      }),
    })),
    contracts: list('contracts', (x, p) => {
      const t = v.obj(x.terms, `${p}.terms`);
      const terms: ContractTerms = {
        rewards: t.rewards === undefined ? [] : v.arr(t.rewards, `${p}.terms.rewards`, (r, rp) => reward(v, r, rp)),
        penalties: t.penalties === undefined ? [] : v.arr(t.penalties, `${p}.terms.penalties`, (r, rp) => reward(v, r, rp)),
      };
      if (t.stake !== undefined) {
        const so = v.obj(t.stake, `${p}.terms.stake`);
        terms.stake = { currencyId: v.str(so.currencyId, `${p}.terms.stake.currencyId`) as never, amount: int(v, so.amount, `${p}.terms.stake.amount`, 1) };
      }
      if (t.riskProfileId !== undefined) terms.riskProfileId = v.str(t.riskProfileId, `${p}.terms.riskProfileId`) as never;
      return {
        id: v.str(x.id, `${p}.id`),
        kind: v.str(x.kind, `${p}.kind`),
        title: v.str(x.title, `${p}.title`),
        description: v.str(x.description, `${p}.description`),
        domain: v.oneOf(x.domain ?? 'PLAY', DOMAINS, `${p}.domain`),
        issuer: owner(v, x.issuer, `${p}.issuer`),
        tasks: v.arr(x.tasks, `${p}.tasks`, (tk, tp) => {
          const to = v.obj(tk, tp);
          return { title: v.str(to.title, `${tp}.title`), requirement: requirement(v, to.requirement, `${tp}.requirement`) };
        }),
        terms,
        locationId: v.optStr(x.locationId, `${p}.locationId`),
        tags: x.tags === undefined ? [] : v.arr(x.tags, `${p}.tags`, (tg, tgp) => v.str(tg, tgp)),
      };
    }),
    searchSpots: list('searchSpots', (x, p) => ({
      id: v.str(x.id, `${p}.id`),
      locationId: v.str(x.locationId, `${p}.locationId`) as never,
      itemId: v.str(x.itemId, `${p}.itemId`) as never,
      quantity: int(v, x.quantity ?? 1, `${p}.quantity`, 1),
      description: v.str(x.description, `${p}.description`),
      requiresFlag: v.optStr(x.requiresFlag, `${p}.requiresFlag`),
    })),
    happenings: list('happenings', (x, p) => {
      const t = v.obj(x.trigger, `${p}.trigger`);
      const tk = v.oneOf(t.kind, ['talk', 'arrive'] as const, `${p}.trigger.kind`);
      const e = v.obj(x.effects ?? {}, `${p}.effects`);
      v.noExtraKeys(e, ['relationships', 'reputation', 'flag'], `${p}.effects`);
      return {
        id: v.str(x.id, `${p}.id`),
        kind: v.str(x.kind, `${p}.kind`),
        title: v.str(x.title, `${p}.title`),
        summary: v.str(x.summary, `${p}.summary`),
        trigger: tk === 'talk' ? { kind: tk, actorId: v.str(t.actorId, `${p}.trigger.actorId`) } : { kind: tk, locationId: v.str(t.locationId, `${p}.trigger.locationId`) },
        effects: {
          relationships: e.relationships === undefined ? undefined : v.arr(e.relationships, `${p}.effects.relationships`, (r, rp) => {
            const ro = v.obj(r, rp);
            return {
              with: v.str(ro.with, `${rp}.with`),
              regard: ro.regard === undefined ? undefined : v.num(ro.regard, `${rp}.regard`, -100, 100),
              trust: ro.trust === undefined ? undefined : v.num(ro.trust, `${rp}.trust`, -100, 100),
              familiarity: ro.familiarity === undefined ? undefined : v.num(ro.familiarity, `${rp}.familiarity`, 0, 100),
            };
          }),
          reputation: e.reputation === undefined ? undefined : v.arr(e.reputation, `${p}.effects.reputation`, (r, rp) => {
            const ro = v.obj(r, rp);
            const so = v.obj(ro.scope, `${rp}.scope`);
            return { scope: { kind: v.oneOf(so.kind, SCOPE_KINDS, `${rp}.scope.kind`), id: v.optStr(so.id, `${rp}.scope.id`) }, amount: v.num(ro.amount, `${rp}.amount`, -100, 100) };
          }),
          flag: v.optStr(e.flag, `${p}.effects.flag`),
        },
        requiresFlag: v.optStr(x.requiresFlag, `${p}.requiresFlag`),
      };
    }),
  };
  return v.ok ? ok(pack) : err('INVALID_CONTENT', v.errors.join('\n'));
}

/** Merge several packs (e.g. a Realm's economy pack + a location pack) into one. */
export function mergePacks(id: string, packs: readonly ContentPack[]): ContentPack {
  const merged = { id, realmId: packs[0]?.realmId ?? '' } as ContentPack;
  for (const key of LISTS) (merged[key] as unknown[]) = packs.flatMap((p) => p[key] as unknown[]);
  return merged;
}

/**
 * Cross-reference checks: unique ids, every reference resolves, every item
 * within the Realm's technology and magic ceiling, every Realm match.
 */
export function validatePack(pack: ContentPack, realm: RealmDefinition): Result<true> {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const key of LISTS) {
    for (const rec of pack[key] as { id: string }[]) {
      if (ids.has(rec.id)) problems.push(`duplicate id ${rec.id}`);
      ids.add(rec.id);
    }
  }
  const has = (key: (typeof LISTS)[number], id: string | undefined) => id === undefined || (pack[key] as { id: string }[]).some((r) => r.id === id);
  const need = (cond: boolean, msg: string) => cond || problems.push(msg);
  const ownerOk = (o: OwnerRef) => (o.kind === 'actor' ? has('actors', o.id) : has('organizations', o.id));
  const primary = realm.constitution.economy.primaryCurrency;

  need(pack.realmId === realm.id, `pack ${pack.id} is for ${pack.realmId}, not ${realm.id}`);
  need(has('currencies', primary), `primary currency ${primary} is not defined`);
  const techCap = rankOf(TECHNOLOGY_SCALE, realm.constitution.technologyCeiling.technology);
  const magicCap = rankOf(MAGIC_SCALE, realm.constitution.technologyCeiling.magic);
  for (const i of pack.items) {
    need(!i.techTier || rankOf(TECHNOLOGY_SCALE, i.techTier) <= techCap, `item ${i.id} exceeds the technology ceiling`);
    need(!i.magicTier || rankOf(MAGIC_SCALE, i.magicTier) <= magicCap, `item ${i.id} exceeds the magic ceiling`);
  }
  for (const r of pack.resources) need(has('items', r.yieldsItemId), `resource ${r.id} yields unknown item ${r.yieldsItemId}`);
  for (const l of pack.locations) need(has('locations', l.parentId), `location ${l.id} has unknown parent ${l.parentId}`);
  for (const r of pack.routes) need(has('locations', r.from) && has('locations', r.to), `route ${r.id} connects unknown locations`);
  for (const a of pack.actors) {
    need(has('locations', a.locationId), `actor ${a.id} is at unknown location ${a.locationId}`);
    for (const i of Object.keys(a.inventory)) need(has('items', i), `actor ${a.id} holds unknown item ${i}`);
  }
  for (const o of pack.organizations) for (const m of o.members) {
    need(has('actors', m.actorId), `organization ${o.id} has unknown member ${m.actorId}`);
    for (const r of m.roleIds) need(pack.roles.some((x) => x.id === r && x.organizationId === o.id), `organization ${o.id} uses unknown role ${r}`);
  }
  for (const m of pack.markets) {
    need(ownerOk(m.vendor), `market ${m.id} has unknown vendor`);
    need(has('locations', m.locationId), `market ${m.id} is at unknown location`);
    need(has('currencies', m.currencyId), `market ${m.id} uses unknown currency`);
    need(!m.drift || has('risks', m.drift.riskProfileId), `market ${m.id} drifts with unknown risk profile`);
    for (const i of Object.keys(m.listings)) need(has('items', i), `market ${m.id} lists unknown item ${i}`);
  }
  for (const n of pack.resourceNodes) need(has('resources', n.resourceId) && has('locations', n.locationId), `resource node ${n.id} has bad references`);
  for (const p of pack.properties) need(has('locations', p.locationId) && (!p.owner || ownerOk(p.owner)) && has('currencies', p.currencyId), `property ${p.id} has bad references`);
  for (const c of pack.contracts) {
    need(ownerOk(c.issuer), `contract ${c.id} has unknown issuer`);
    need(has('locations', c.locationId), `contract ${c.id} is at unknown location`);
    need(has('risks', c.terms.riskProfileId), `contract ${c.id} uses unknown risk profile`);
    for (const t of c.tasks) {
      const r = t.requirement;
      if (r.kind === 'deliver') need(has('items', r.itemId) && has('actors', r.to), `contract ${c.id} delivery has bad references`);
      if (r.kind === 'acquire') need(has('items', r.itemId), `contract ${c.id} needs unknown item ${r.itemId}`);
      if (r.kind === 'visit') need(has('locations', r.locationId), `contract ${c.id} visits unknown location`);
      if (r.kind === 'talk') need(has('actors', r.actorId), `contract ${c.id} talks to unknown actor`);
    }
    for (const r of [...c.terms.rewards, ...c.terms.penalties]) {
      if (r.kind === 'currency') need(has('currencies', r.currencyId), `contract ${c.id} pays unknown currency`);
      if (r.kind === 'item') need(has('items', r.itemId), `contract ${c.id} rewards unknown item`);
      if (r.kind === 'relationship') need(has('actors', r.with), `contract ${c.id} relationship with unknown actor`);
    }
  }
  for (const s of pack.searchSpots) need(has('locations', s.locationId) && has('items', s.itemId), `search spot ${s.id} has bad references`);
  for (const h of pack.happenings) {
    need(h.trigger.kind === 'talk' ? has('actors', h.trigger.actorId) : has('locations', h.trigger.locationId), `happening ${h.id} has an unknown trigger target`);
    for (const r of h.effects.relationships ?? []) need(has('actors', r.with), `happening ${h.id} involves unknown actor ${r.with}`);
  }
  return problems.length ? err('INVALID_CONTENT', problems.join('\n')) : ok(true);
}
