import { err, ok, type Result } from '../core/result';
import { Validator, rankOf } from '../core/schema';
import type { CurrencyId, RealmId, ServerId } from '../core/refs';
import {
  AI_DENSITIES,
  CANONICAL_STRICTNESS,
  INTERACTION_CATEGORIES,
  MAGIC_SCALE,
  PERSISTENCE_LEVELS,
  PROPERTY_RISKS,
  PVP_LEVELS,
  REALM_TYPES,
  REALM_TYPE_DEFINITIONS,
  TECHNOLOGY_SCALE,
  type BorderRule,
  type InteractionCategory,
  type RealmConstitution,
  type RealmDefinition,
} from './realm';
import {
  ACCESS_LEVELS,
  CRIME_LEVELS,
  ECONOMIC_RISKS,
  FAMILIAR_DANGERS,
  HISTORY_MODES,
  POLITICS_LEVELS,
  SERVER_PRESETS,
  SERVER_VARIABLE_KEYS,
  TECHNOLOGY_MODES,
  WAR_LEVELS,
  type ServerConstitution,
  type ServerDefinition,
  type ServerVariables,
} from './server';

/* ------------------------------------------------------------------ */
/* Parsing authored JSON                                               */
/* ------------------------------------------------------------------ */

const contentError = (v: Validator) => err('INVALID_CONTENT', v.errors.join('\n'));

function parseBorder(v: Validator, raw: unknown, path: string): BorderRule {
  const o = v.obj(raw, path);
  v.noExtraKeys(o, ['categories', 'maxTechnology', 'maxMagic', 'requireProvenance'], path);
  return {
    categories: v.arr(o.categories, `${path}.categories`, (x, p) => v.str(x, p)),
    maxTechnology: v.oneOf(o.maxTechnology, TECHNOLOGY_SCALE, `${path}.maxTechnology`),
    maxMagic: v.oneOf(o.maxMagic, MAGIC_SCALE, `${path}.maxMagic`),
    requireProvenance: v.bool(o.requireProvenance, `${path}.requireProvenance`),
  };
}

export function parseVariables(v: Validator, raw: unknown, path: string, partial: boolean): Partial<ServerVariables> {
  const o = v.obj(raw, path);
  v.noExtraKeys(o, SERVER_VARIABLE_KEYS, path);
  const scales: Record<keyof ServerVariables, readonly string[]> = {
    war: WAR_LEVELS,
    pvp: PVP_LEVELS,
    propertyRisk: PROPERTY_RISKS,
    economicRisk: ECONOMIC_RISKS,
    crime: CRIME_LEVELS,
    familiarDanger: FAMILIAR_DANGERS,
    technology: TECHNOLOGY_MODES,
    history: HISTORY_MODES,
    politics: POLITICS_LEVELS,
    persistence: PERSISTENCE_LEVELS,
    access: ACCESS_LEVELS,
    canonicalStrictness: CANONICAL_STRICTNESS,
    aiDensity: AI_DENSITIES,
  };
  const out: Record<string, string> = {};
  for (const key of SERVER_VARIABLE_KEYS) {
    if (partial && o[key] === undefined) continue;
    out[key] = v.oneOf(o[key], scales[key], `${path}.${key}`);
  }
  return out as Partial<ServerVariables>;
}

export function parseServerConstitution(raw: unknown, source = 'server-constitution'): Result<ServerConstitution> {
  const v = new Validator(source);
  const o = v.obj(raw, '');
  v.noExtraKeys(o, ['preset', 'name', 'description', 'variables', 'ownerOverridable'], '');
  const parsed: ServerConstitution = {
    preset: v.oneOf(o.preset, SERVER_PRESETS, 'preset'),
    name: v.str(o.name, 'name'),
    description: v.str(o.description, 'description'),
    variables: parseVariables(v, o.variables, 'variables', false) as ServerVariables,
    ownerOverridable: v.arr(o.ownerOverridable, 'ownerOverridable', (x, p) => v.oneOf(x, SERVER_VARIABLE_KEYS, p)),
  };
  return v.ok ? ok(parsed) : contentError(v);
}

export function parseServerDefinition(raw: unknown, source = 'server'): Result<ServerDefinition> {
  const v = new Validator(source);
  const o = v.obj(raw, '');
  v.noExtraKeys(o, ['id', 'name', 'realmId', 'preset', 'overrides'], '');
  const parsed: ServerDefinition = {
    id: v.str(o.id, 'id') as ServerId,
    name: v.str(o.name, 'name'),
    realmId: v.str(o.realmId, 'realmId') as RealmId,
    preset: v.oneOf(o.preset, SERVER_PRESETS, 'preset'),
    overrides: o.overrides === undefined ? {} : parseVariables(v, o.overrides, 'overrides', true),
  };
  return v.ok ? ok(parsed) : contentError(v);
}

export function parseRealmDefinition(raw: unknown, source = 'realm'): Result<RealmDefinition> {
  const v = new Validator(source);
  const o = v.obj(raw, '');
  v.noExtraKeys(o, ['id', 'name', 'type', 'description', 'constitution', 'presentation'], '');
  const type = v.oneOf(o.type, REALM_TYPES, 'type');
  const c = v.obj(o.constitution, 'constitution');
  v.noExtraKeys(
    c,
    ['technologyCeiling', 'progression', 'imports', 'exports', 'economy', 'crossRealm', 'legalInteractions', 'servers', 'pvp', 'property', 'ai', 'canonicalStrictness', 'persistence'],
    'constitution',
  );
  const tc = v.obj(c.technologyCeiling, 'constitution.technologyCeiling');
  const prog = v.obj(c.progression, 'constitution.progression');
  const eco = v.obj(c.economy, 'constitution.economy');
  const xr = v.obj(c.crossRealm, 'constitution.crossRealm');
  const srv = v.obj(c.servers, 'constitution.servers');
  const pvp = v.obj(c.pvp, 'constitution.pvp');
  const prop = v.obj(c.property, 'constitution.property');
  const ai = v.obj(c.ai, 'constitution.ai');

  // The core rule is not configurable: the person, identity and history always travel.
  for (const k of ['person', 'identity', 'history'] as const) {
    if (xr[k] !== 'carried') v.fail(`constitution.crossRealm.${k}`, 'must be "carried": your person travels further than your equipment');
  }

  const constitution: RealmConstitution = {
    technologyCeiling: {
      technology: v.oneOf(tc.technology, TECHNOLOGY_SCALE, 'constitution.technologyCeiling.technology'),
      magic: v.oneOf(tc.magic, MAGIC_SCALE, 'constitution.technologyCeiling.magic'),
    },
    progression: {
      history: v.bool(prog.history, 'constitution.progression.history'),
      technology: v.bool(prog.technology, 'constitution.progression.technology'),
    },
    imports: parseBorder(v, c.imports, 'constitution.imports'),
    exports: parseBorder(v, c.exports, 'constitution.exports'),
    economy: {
      primaryCurrency: v.str(eco.primaryCurrency, 'constitution.economy.primaryCurrency') as CurrencyId,
      marketVolatility: v.oneOf(eco.marketVolatility, ['LOW', 'NORMAL', 'HIGH'] as const, 'constitution.economy.marketVolatility'),
      startingPurse: v.num(eco.startingPurse, 'constitution.economy.startingPurse', 0),
    },
    crossRealm: {
      person: 'carried',
      identity: 'carried',
      history: 'carried',
      reputation: v.oneOf(xr.reputation, ['local', 'reference'] as const, 'constitution.crossRealm.reputation'),
      currency: v.oneOf(xr.currency, ['none', 'exchange'] as const, 'constitution.crossRealm.currency'),
      items: v.oneOf(xr.items, ['none', 'within-ceiling', 'listed'] as const, 'constitution.crossRealm.items'),
      familiars: v.oneOf(xr.familiars, ['none', 'form-shift', 'as-is'] as const, 'constitution.crossRealm.familiars'),
    },
    legalInteractions: v.arr(c.legalInteractions, 'constitution.legalInteractions', (x, p) => v.oneOf(x, INTERACTION_CATEGORIES, p)),
    servers: {
      launchPreset: v.oneOf(srv.launchPreset ?? srv.defaultPreset, SERVER_PRESETS, 'constitution.servers.launchPreset'),
      allowedPresets: v.arr(srv.allowedPresets, 'constitution.servers.allowedPresets', (x, p) => v.oneOf(x, SERVER_PRESETS, p)),
      futureCompatiblePresets:
        srv.futureCompatiblePresets === undefined ? [] : v.arr(srv.futureCompatiblePresets, 'constitution.servers.futureCompatiblePresets', (x, p) => v.oneOf(x, SERVER_PRESETS, p)),
      defaultPreset: v.oneOf(srv.defaultPreset, SERVER_PRESETS, 'constitution.servers.defaultPreset'),
    },
    pvp: { max: v.oneOf(pvp.max, PVP_LEVELS, 'constitution.pvp.max') },
    property: {
      ownershipAllowed: v.bool(prop.ownershipAllowed, 'constitution.property.ownershipAllowed'),
      maxRisk: v.oneOf(prop.maxRisk, PROPERTY_RISKS, 'constitution.property.maxRisk'),
    },
    ai: {
      defaultDensity: v.oneOf(ai.defaultDensity, AI_DENSITIES, 'constitution.ai.defaultDensity'),
      maxDensity: v.oneOf(ai.maxDensity, AI_DENSITIES, 'constitution.ai.maxDensity'),
    },
    canonicalStrictness: v.oneOf(c.canonicalStrictness, CANONICAL_STRICTNESS, 'constitution.canonicalStrictness'),
    persistence: v.oneOf(c.persistence, PERSISTENCE_LEVELS, 'constitution.persistence'),
  };

  // Consistency with the Realm type's definition.
  const def = REALM_TYPE_DEFINITIONS[type];
  if (def.history === 'progresses' && !constitution.progression.history) v.fail('constitution.progression.history', `${type} Realms progress history`);
  if (def.history === 'frozen' && constitution.progression.history) v.fail('constitution.progression.history', `${type} Realms preserve a fixed history`);
  if (def.technology === 'fixed' && constitution.progression.technology) v.fail('constitution.progression.technology', `${type} Realms have a fixed technology ceiling`);
  if (def.technology === 'progresses' && !constitution.progression.technology) v.fail('constitution.progression.technology', `${type} Realms progress technology`);
  if (!constitution.servers.allowedPresets.includes(constitution.servers.defaultPreset)) {
    v.fail('constitution.servers.defaultPreset', 'default preset must be one of allowedPresets');
  }
  if (!constitution.servers.allowedPresets.includes(constitution.servers.launchPreset)) {
    v.fail('constitution.servers.launchPreset', 'launch preset must be one of allowedPresets');
  }
  for (const f of constitution.servers.futureCompatiblePresets) {
    if (constitution.servers.allowedPresets.includes(f)) v.fail('constitution.servers.futureCompatiblePresets', `${f} cannot be both allowed now and future-only`);
  }
  if (rankOf(AI_DENSITIES, constitution.ai.defaultDensity) > rankOf(AI_DENSITIES, constitution.ai.maxDensity)) {
    v.fail('constitution.ai.defaultDensity', 'default AI density exceeds the maximum');
  }
  for (const side of ['imports', 'exports'] as const) {
    const b = constitution[side];
    if (rankOf(TECHNOLOGY_SCALE, b.maxTechnology) > rankOf(TECHNOLOGY_SCALE, constitution.technologyCeiling.technology) && side === 'imports') {
      v.fail(`constitution.${side}.maxTechnology`, 'imports cannot exceed the Realm technology ceiling');
    }
    if (rankOf(MAGIC_SCALE, b.maxMagic) > rankOf(MAGIC_SCALE, constitution.technologyCeiling.magic) && side === 'imports') {
      v.fail(`constitution.${side}.maxMagic`, 'imports cannot exceed the Realm magic ceiling');
    }
  }

  const parsed: RealmDefinition = {
    id: v.str(o.id, 'id') as RealmId,
    name: v.str(o.name, 'name'),
    type,
    description: v.str(o.description, 'description'),
    constitution,
    presentation: o.presentation === undefined ? undefined : v.obj(o.presentation, 'presentation'),
  };
  return v.ok ? ok(parsed) : contentError(v);
}

/* ------------------------------------------------------------------ */
/* Resolving a running server's rules                                  */
/* ------------------------------------------------------------------ */

/** Feature gates of the current platform release. */
export interface ReleaseGate {
  /** First release is PEACETIME: war must be OFF everywhere. */
  warAllowed: boolean;
}

export interface ResolvedRules {
  realm: RealmDefinition;
  server: ServerDefinition;
  preset: ServerConstitution;
  variables: ServerVariables;
}

/**
 * Combine preset + owner overrides, then check the result against the Realm
 * Constitution and the release gate. Every violation is reported.
 */
export function resolveServerRules(
  realm: RealmDefinition,
  preset: ServerConstitution,
  server: ServerDefinition,
  release: ReleaseGate,
): Result<ResolvedRules> {
  const problems: string[] = [];
  const c = realm.constitution;
  if (server.realmId !== realm.id) problems.push(`server ${server.id} belongs to ${server.realmId}, not ${realm.id}`);
  if (server.preset !== preset.preset) problems.push(`server uses preset ${server.preset} but ${preset.preset} was supplied`);
  if (c.servers.futureCompatiblePresets.includes(server.preset)) {
    problems.push(`${server.preset} is future-compatible in ${realm.name} but not enabled yet`);
  } else if (!c.servers.allowedPresets.includes(server.preset)) {
    problems.push(`${realm.name} does not allow ${server.preset} servers`);
  }
  for (const k of Object.keys(server.overrides) as (keyof ServerVariables)[]) {
    if (!preset.ownerOverridable.includes(k)) problems.push(`${preset.preset} does not let owners override "${k}"`);
  }
  const variables = { ...preset.variables, ...server.overrides } as ServerVariables;

  if (!release.warAllowed && variables.war !== 'OFF') problems.push('war is not available in this release (PEACETIME)');
  if (variables.war !== 'OFF' && !c.legalInteractions.includes('war')) problems.push(`${realm.name} does not recognise war`);
  if (variables.crime === 'PLAYER' && !c.legalInteractions.includes('crime')) problems.push(`${realm.name} does not allow player crime`);
  if (variables.politics !== 'NONE' && !c.legalInteractions.includes('politics')) problems.push(`${realm.name} does not allow politics`);
  if (rankOf(PVP_LEVELS, variables.pvp) > rankOf(PVP_LEVELS, c.pvp.max)) problems.push(`PvP ${variables.pvp} exceeds ${realm.name}'s maximum ${c.pvp.max}`);
  if (variables.propertyRisk !== 'SAFE' && !c.property.ownershipAllowed) problems.push('property risk requires property ownership');
  if (rankOf(PROPERTY_RISKS, variables.propertyRisk) > rankOf(PROPERTY_RISKS, c.property.maxRisk)) problems.push(`property risk ${variables.propertyRisk} exceeds ${c.property.maxRisk}`);
  if (rankOf(AI_DENSITIES, variables.aiDensity) > rankOf(AI_DENSITIES, c.ai.maxDensity)) problems.push(`AI density ${variables.aiDensity} exceeds ${c.ai.maxDensity}`);
  if (rankOf(CANONICAL_STRICTNESS, variables.canonicalStrictness) < rankOf(CANONICAL_STRICTNESS, c.canonicalStrictness)) {
    problems.push(`canonical strictness ${variables.canonicalStrictness} is looser than ${realm.name}'s ${c.canonicalStrictness}`);
  }
  if (rankOf(PERSISTENCE_LEVELS, variables.persistence) > rankOf(PERSISTENCE_LEVELS, c.persistence)) problems.push(`persistence ${variables.persistence} exceeds ${c.persistence}`);
  if (variables.technology === 'PROGRESSIVE' && !c.progression.technology) problems.push(`${realm.type} Realms have a fixed technology ceiling`);
  if (variables.history === 'PROGRESSIVE' && !c.progression.history) problems.push(`${realm.name} preserves a fixed history`);

  return problems.length ? err('CONSTITUTION_VIOLATION', problems.join('\n')) : ok({ realm, server, preset, variables });
}

/* ------------------------------------------------------------------ */
/* Rule queries used by gameplay systems                               */
/* ------------------------------------------------------------------ */

export function allowsInteraction(rules: ResolvedRules, category: InteractionCategory): boolean {
  if (!rules.realm.constitution.legalInteractions.includes(category)) return false;
  const v = rules.variables;
  switch (category) {
    case 'war':
      return v.war !== 'OFF';
    case 'duel':
      return v.pvp !== 'OFF';
    case 'crime':
      return v.crime === 'PLAYER';
    case 'politics':
      return v.politics !== 'NONE';
    default:
      return true;
  }
}

/**
 * May an owner lose property against their will (seizure, raid, destruction)?
 * Never on a SAFE server: Peaceful property is not involuntarily destroyed or
 * seized. Other constitutions may allow it only with explicit player consent.
 */
export function allowsInvoluntaryPropertyLoss(rules: ResolvedRules | undefined): boolean {
  return !!rules && rules.variables.propertyRisk !== 'SAFE';
}

/** Is player-vs-player harm allowed between these actors? */
export function pvpAllowed(rules: ResolvedRules, opts: { bothConsented: boolean; inPvpZone: boolean }): boolean {
  switch (rules.variables.pvp) {
    case 'OFF':
      return false;
    case 'CONSENT':
      return opts.bothConsented;
    case 'ZONED':
      return opts.inPvpZone || opts.bothConsented;
    case 'OPEN':
      return true;
  }
}

/* ------------------------------------------------------------------ */
/* Cross-Realm travel: YOUR PERSON TRAVELS FURTHER THAN YOUR EQUIPMENT */
/* ------------------------------------------------------------------ */

export interface TransferableItem {
  id: string;
  category: string;
  technology?: string;
  magic?: string;
  hasProvenance: boolean;
}

export interface TransferableFamiliar {
  id: string;
  realmForms: Record<string, string>;
}

export interface TransferRequest {
  items: TransferableItem[];
  currency: { currencyId: string; amount: number }[];
  familiars: TransferableFamiliar[];
}

export interface TransferPlan {
  /** Always true: the person, identity and history travel. */
  person: true;
  identity: true;
  history: true;
  reputation: 'stays' | 'visible-as-reference';
  items: { carried: string[]; leftBehind: { id: string; reason: string }[] };
  currency: { carried: { currencyId: string; amount: number }[]; leftBehind: { currencyId: string; amount: number; reason: string }[] };
  familiars: { carried: { id: string; form: string }[]; leftBehind: { id: string; reason: string }[] };
}

function itemCrossing(item: TransferableItem, out: BorderRule, inn: BorderRule, dest: RealmConstitution): string | undefined {
  if (!out.categories.includes(item.category)) return `origin does not export ${item.category}`;
  if (!inn.categories.includes(item.category)) return `destination does not import ${item.category}`;
  if ((out.requireProvenance || inn.requireProvenance) && !item.hasProvenance) return 'missing provenance';
  const tech = item.technology ?? TECHNOLOGY_SCALE[0]!;
  const magic = item.magic ?? MAGIC_SCALE[0]!;
  const techCap = Math.min(rankOf(TECHNOLOGY_SCALE, inn.maxTechnology), rankOf(TECHNOLOGY_SCALE, dest.technologyCeiling.technology));
  const magicCap = Math.min(rankOf(MAGIC_SCALE, inn.maxMagic), rankOf(MAGIC_SCALE, dest.technologyCeiling.magic));
  if (rankOf(TECHNOLOGY_SCALE, tech) > techCap) return `technology "${tech}" exceeds the destination ceiling`;
  if (rankOf(MAGIC_SCALE, magic) > magicCap) return `magic "${magic}" exceeds the destination ceiling`;
  return undefined;
}

/**
 * Decide what crosses from one Realm to another. Pure planning — the caller
 * performs the moves. The person, identity and history always cross;
 * equipment crosses only as both constitutions allow.
 */
export function planRealmTransfer(from: RealmDefinition, to: RealmDefinition, req: TransferRequest): TransferPlan {
  const a = from.constitution;
  const b = to.constitution;
  const plan: TransferPlan = {
    person: true,
    identity: true,
    history: true,
    reputation: b.crossRealm.reputation === 'reference' ? 'visible-as-reference' : 'stays',
    items: { carried: [], leftBehind: [] },
    currency: { carried: [], leftBehind: [] },
    familiars: { carried: [], leftBehind: [] },
  };

  const itemsMode = a.crossRealm.items === 'none' || b.crossRealm.items === 'none' ? 'none' : 'within-ceiling';
  for (const item of req.items) {
    const reason = itemsMode === 'none' ? 'items do not cross between these Realms' : itemCrossing(item, a.exports, b.imports, b);
    if (reason) plan.items.leftBehind.push({ id: item.id, reason });
    else plan.items.carried.push(item.id);
  }

  const exchange = a.crossRealm.currency === 'exchange' && b.crossRealm.currency === 'exchange';
  for (const c of req.currency) {
    if (exchange) plan.currency.carried.push(c);
    else plan.currency.leftBehind.push({ ...c, reason: 'currency stays in its Realm' });
  }

  const famMode = a.crossRealm.familiars === 'none' || b.crossRealm.familiars === 'none' ? 'none' : b.crossRealm.familiars;
  for (const f of req.familiars) {
    if (famMode === 'none') {
      plan.familiars.leftBehind.push({ id: f.id, reason: 'familiars do not cross between these Realms' });
    } else if (famMode === 'form-shift') {
      const form = f.realmForms[to.id];
      if (form) plan.familiars.carried.push({ id: f.id, form });
      else plan.familiars.leftBehind.push({ id: f.id, reason: `no ${to.name} form exists for this familiar` });
    } else {
      plan.familiars.carried.push({ id: f.id, form: f.realmForms[from.id] ?? 'native' });
    }
  }
  return plan;
}
