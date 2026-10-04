import { describe, expect, it } from 'vitest';
import realmTypes from '../canon/realm-types.json';
import happyFallRaw from '../realms/happy-fall/realm.json';
import peacefulRaw from '../server-constitutions/peaceful.json';
import { RELEASE } from '../src/config/build';
import { content } from '../src/config/content';
import {
  REALM_TYPES,
  REALM_TYPE_DEFINITIONS,
  SERVER_PRESETS,
  allowsInteraction,
  parseRealmDefinition,
  parseServerConstitution,
  parseServerDefinition,
  planRealmTransfer,
  pvpAllowed,
  resolveServerRules,
  type RealmDefinition,
  type ServerDefinition,
} from '../src/world';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const happyFall = () => content.realm('realm_happy-fall');
const server = (over: Partial<ServerDefinition> = {}): ServerDefinition => ({
  id: 'server_t' as never,
  name: 'T',
  realmId: 'realm_happy-fall' as never,
  preset: 'PEACEFUL',
  overrides: {},
  ...over,
});

describe('Realm types', () => {
  it('defines all six types with the canonical meanings', () => {
    expect([...REALM_TYPES]).toEqual(realmTypes.types.map((t) => t.type));
    expect(REALM_TYPE_DEFINITIONS.ANCHORED).toMatchObject({ history: 'progresses', technology: 'fixed' });
    expect(REALM_TYPE_DEFINITIONS.ASCENDANT).toMatchObject({ history: 'progresses', technology: 'progresses' });
    expect(REALM_TYPE_DEFINITIONS.ECHO.history).toBe('frozen');
    expect(REALM_TYPE_DEFINITIONS.INTERREALM.definition).toMatch(/multiple Realm civilizations/);
  });
});

describe('Realm configuration parsing', () => {
  it('parses Happy Fall as an ANCHORED medieval / early-fantasy Realm', () => {
    const r = parseRealmDefinition(happyFallRaw);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value).toMatchObject({
      name: 'Happy Fall',
      type: 'ANCHORED',
      constitution: {
        technologyCeiling: { technology: 'medieval', magic: 'early-fantasy' },
        progression: { history: true, technology: false },
        servers: { defaultPreset: 'PEACEFUL' },
        ai: { defaultDensity: 'MINIMAL' },
        crossRealm: { person: 'carried', identity: 'carried', history: 'carried' },
      },
    });
  });

  it('reports every content error with its path', () => {
    const bad = clone(happyFallRaw) as Record<string, any>;
    bad.type = 'STEAMPUNK';
    bad.constitution.technologyCeiling.technology = 'warp-drive';
    bad.constitution.pvpp = {};
    const r = parseRealmDefinition(bad, 'happy-fall');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain('happy-fall.type');
      expect(r.error.message).toContain('happy-fall.constitution.technologyCeiling.technology');
      expect(r.error.message).toContain('happy-fall.constitution.pvpp: unknown field');
    }
  });

  it('rejects an ANCHORED Realm that claims progressing technology', () => {
    const bad = clone(happyFallRaw);
    bad.constitution.progression.technology = true;
    const r = parseRealmDefinition(bad);
    expect(!r.ok && r.error.message).toMatch(/fixed technology ceiling/);
  });

  it('refuses to let a Realm stop the person, identity or history from travelling', () => {
    const bad = clone(happyFallRaw) as Record<string, any>;
    bad.constitution.crossRealm.identity = 'confiscated';
    const r = parseRealmDefinition(bad);
    expect(!r.ok && r.error.message).toMatch(/your person travels further than your equipment/);
  });

  it('rejects imports above the Realm ceiling', () => {
    const bad = clone(happyFallRaw);
    bad.constitution.imports.maxTechnology = 'industrial';
    expect(parseRealmDefinition(bad).ok).toBe(false);
  });
});

describe('Server constitution parsing', () => {
  it('loads all ten presets from data', () => {
    expect([...content.presets.keys()].sort()).toEqual([...SERVER_PRESETS].sort());
  });

  it('PEACEFUL defaults match the specification exactly', () => {
    const r = parseServerConstitution(peacefulRaw);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.variables).toEqual({
      war: 'OFF',
      pvp: 'OFF',
      propertyRisk: 'SAFE',
      economicRisk: 'NORMAL',
      crime: 'NPC_ONLY',
      familiarDanger: 'LOW',
      technology: 'FIXED',
      history: 'PROGRESSIVE',
      politics: 'LIGHT',
      persistence: 'LONG_TERM',
      access: 'PRIVATE',
      canonicalStrictness: 'STANDARD',
      aiDensity: 'MINIMAL',
    });
  });

  it('rejects unknown values, missing variables and unknown keys', () => {
    const bad = clone(peacefulRaw) as Record<string, any>;
    bad.variables.war = 'SOMETIMES';
    delete bad.variables.crime;
    bad.variables.dragons = 'YES';
    const r = parseServerConstitution(bad, 'peaceful');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain('peaceful.variables.war');
      expect(r.error.message).toContain('peaceful.variables.crime');
      expect(r.error.message).toContain('peaceful.variables.dragons: unknown field');
    }
  });

  it('parses server definitions with partial overrides', () => {
    const r = parseServerDefinition({ id: 's', name: 'S', realmId: 'r', preset: 'PEACEFUL', overrides: { access: 'PUBLIC' } });
    expect(r.ok && r.value.overrides).toEqual({ access: 'PUBLIC' });
    expect(parseServerDefinition({ id: 's', name: 'S', realmId: 'r', preset: 'PEACEFUL', overrides: { access: 'EVERYONE' } }).ok).toBe(false);
  });
});

describe('Resolving server rules against Realm + release', () => {
  it('the default Blackmere server resolves to PEACEFUL', () => {
    const rules = content.rulesFor('server_happy-fall-blackmere');
    expect(rules.variables.war).toBe('OFF');
    expect(rules.variables.aiDensity).toBe('MINIMAL');
    expect(allowsInteraction(rules, 'trade')).toBe(true);
    expect(allowsInteraction(rules, 'war')).toBe(false);
    expect(allowsInteraction(rules, 'duel')).toBe(false);
    expect(pvpAllowed(rules, { bothConsented: true, inPvpZone: true })).toBe(false);
  });

  it('every preset Happy Fall allows resolves cleanly', () => {
    for (const p of happyFall().constitution.servers.allowedPresets) {
      const r = resolveServerRules(happyFall(), content.preset(p as never), server({ preset: p as never }), RELEASE);
      expect(r.ok, `${p}: ${!r.ok && r.error.message}`).toBe(true);
    }
  });

  it('war presets are refused in the PEACETIME release and by Happy Fall', () => {
    const consent = resolveServerRules(happyFall(), content.preset('CONSENT_WAR'), server({ preset: 'CONSENT_WAR' }), RELEASE);
    expect(!consent.ok && consent.error.message).toMatch(/not available in this release/);
    expect(!consent.ok && consent.error.message).toMatch(/future-compatible in Happy Fall but not enabled yet/);
    const full = resolveServerRules(happyFall(), content.preset('FULL_CONFLICT'), server({ preset: 'FULL_CONFLICT' }), RELEASE);
    expect(!full.ok && full.error.message).toMatch(/does not allow FULL_CONFLICT/);
  });

  it('Happy Fall launches PEACEFUL; consent war and protected civilians stay future-compatible; Full Conflict is not exposed', () => {
    const s = happyFall().constitution.servers;
    expect(s.launchPreset).toBe('PEACEFUL');
    expect(s.futureCompatiblePresets.sort()).toEqual(['CONSENT_WAR', 'PROTECTED_CIVILIAN']);
    expect(s.allowedPresets).not.toContain('FULL_CONFLICT');
    expect(s.futureCompatiblePresets).not.toContain('FULL_CONFLICT');
    expect(s.allowedPresets).not.toContain('PROGRESSIVE_ERA');
    expect(happyFall().constitution.technologyCeiling).toEqual({ technology: 'medieval', magic: 'early-fantasy' });
    // Every preset's definition is still kept as data.
    for (const p of ['PRIVATE', 'FAMILY_FRIENDS', 'CONSENT_WAR', 'PROTECTED_CIVILIAN', 'FULL_CONFLICT', 'CURATED_ROLEPLAY', 'EXPERIMENTAL', 'FROZEN_ERA'] as const) {
      expect(content.preset(p).preset).toBe(p);
    }
  });

  it('a preset cannot be both allowed now and future-only', () => {
    const bad = clone(happyFallRaw) as Record<string, any>;
    bad.constitution.servers.allowedPresets.push('CONSENT_WAR');
    expect(parseRealmDefinition(bad).ok).toBe(false);
  });

  it('even a war-recognising Realm cannot run war while the release gate is closed', () => {
    const warRealm: RealmDefinition = clone(happyFall());
    warRealm.constitution.legalInteractions.push('war', 'crime', 'duel');
    warRealm.constitution.servers.allowedPresets.push('CONSENT_WAR');
    warRealm.constitution.servers.futureCompatiblePresets = warRealm.constitution.servers.futureCompatiblePresets.filter((p) => p !== 'CONSENT_WAR');
    warRealm.constitution.pvp.max = 'OPEN';
    warRealm.constitution.property.maxRisk = 'RAIDABLE';
    const preset = content.preset('CONSENT_WAR');
    expect(resolveServerRules(warRealm, preset, server({ preset: 'CONSENT_WAR' }), RELEASE).ok).toBe(false);
    expect(resolveServerRules(warRealm, preset, server({ preset: 'CONSENT_WAR' }), { warAllowed: true }).ok).toBe(true);
  });

  it('PROGRESSIVE_ERA cannot run on an ANCHORED Realm', () => {
    const r = resolveServerRules(happyFall(), content.preset('PROGRESSIVE_ERA'), server({ preset: 'PROGRESSIVE_ERA' }), RELEASE);
    expect(!r.ok && r.error.message).toMatch(/fixed technology ceiling/);
  });

  it('owner overrides are limited to what the preset allows and to the Realm caps', () => {
    const ok = resolveServerRules(happyFall(), content.preset('PEACEFUL'), server({ overrides: { access: 'PUBLIC', aiDensity: 'RICH' } }), RELEASE);
    expect(ok.ok && ok.value.variables).toMatchObject({ access: 'PUBLIC', aiDensity: 'RICH' });
    const notOverridable = resolveServerRules(happyFall(), content.preset('PEACEFUL'), server({ overrides: { pvp: 'CONSENT' } }), RELEASE);
    expect(!notOverridable.ok && notOverridable.error.message).toMatch(/does not let owners override "pvp"/);
    const looser = resolveServerRules(happyFall(), content.preset('EXPERIMENTAL'), server({ preset: 'EXPERIMENTAL', overrides: { propertyRisk: 'RAIDABLE' } }), RELEASE);
    expect(!looser.ok && looser.error.message).toMatch(/property risk RAIDABLE exceeds SAFE/);
  });
});

describe('Cross-Realm transfer — your person travels further than your equipment', () => {
  function otherRealm(): RealmDefinition {
    const r: RealmDefinition = clone(happyFall());
    r.id = 'realm_ironreach' as never;
    r.name = 'Ironreach';
    r.type = 'ASCENDANT';
    r.constitution.technologyCeiling = { technology: 'industrial', magic: 'none' };
    r.constitution.progression.technology = true;
    r.constitution.imports = { ...r.constitution.imports, maxTechnology: 'industrial', maxMagic: 'none' };
    r.constitution.exports = { ...r.constitution.exports, maxTechnology: 'industrial', maxMagic: 'none' };
    return r;
  }

  it('person, identity and history always travel; equipment is filtered', () => {
    const plan = planRealmTransfer(otherRealm(), happyFall(), {
      items: [
        { id: 'bread', category: 'food', technology: 'medieval', hasProvenance: true },
        { id: 'steam-lantern', category: 'tool', technology: 'industrial', hasProvenance: true },
        { id: 'unmarked-crate', category: 'trade-good', hasProvenance: false },
        { id: 'cannon', category: 'weapon', technology: 'industrial', hasProvenance: true },
      ],
      currency: [{ currencyId: 'currency_bolt', amount: 500 }],
      familiars: [
        { id: 'hound', realmForms: { 'realm_happy-fall': 'russet hound', realm_ironreach: 'brass-collared hound' } },
        { id: 'automaton-cat', realmForms: { realm_ironreach: 'clockwork cat' } },
      ],
    });
    expect(plan).toMatchObject({ person: true, identity: true, history: true, reputation: 'stays' });
    expect(plan.items.carried).toEqual(['bread']);
    expect(plan.items.leftBehind.map((l) => [l.id, l.reason])).toEqual([
      ['steam-lantern', 'technology "industrial" exceeds the destination ceiling'],
      ['unmarked-crate', 'missing provenance'],
      ['cannon', 'origin does not export weapon'],
    ]);
    expect(plan.currency.carried).toEqual([]);
    expect(plan.currency.leftBehind[0]).toMatchObject({ amount: 500, reason: 'currency stays in its Realm' });
    expect(plan.familiars.carried).toEqual([{ id: 'hound', form: 'russet hound' }]);
    expect(plan.familiars.leftBehind[0]!.id).toBe('automaton-cat');
  });

  it('with everything restricted, the person still travels', () => {
    const closed: RealmDefinition = clone(happyFall());
    closed.constitution.crossRealm.items = 'none';
    closed.constitution.crossRealm.familiars = 'none';
    const plan = planRealmTransfer(happyFall(), closed, {
      items: [{ id: 'apple', category: 'food', hasProvenance: true }],
      currency: [{ currencyId: 'currency_mark', amount: 3 }],
      familiars: [{ id: 'hound', realmForms: { 'realm_happy-fall': 'hound' } }],
    });
    expect(plan.person && plan.identity && plan.history).toBe(true);
    expect(plan.items.carried).toEqual([]);
    expect(plan.familiars.carried).toEqual([]);
  });
});
