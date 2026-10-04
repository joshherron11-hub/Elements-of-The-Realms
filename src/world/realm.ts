import realmTypesData from '../../canon/realm-types.json';
import technologyData from '../../canon/technology.json';
import type { CurrencyId, RealmId } from '../core/refs';
import type { RealmType } from './types';

/**
 * REALMS
 *
 * A Realm is a civilization. Its Realm Constitution — authored data — fixes
 * what is possible there: technology ceiling, what may enter and leave, the
 * economic and legal frame, and which kinds of server may run it.
 */
export const REALM_TYPES: readonly RealmType[] = ['ANCHORED', 'ASCENDANT', 'ECHO', 'FRACTURE', 'PLANETARY', 'INTERREALM'];

export type ProgressionRule = 'progresses' | 'fixed' | 'frozen' | 'configurable';

export interface RealmTypeDefinition {
  readonly type: RealmType;
  readonly definition: string;
  readonly history: 'progresses' | 'frozen' | 'configurable';
  readonly technology: 'progresses' | 'fixed' | 'configurable';
}

export const REALM_TYPE_DEFINITIONS: Readonly<Record<RealmType, RealmTypeDefinition>> = Object.fromEntries(
  (realmTypesData.types as RealmTypeDefinition[]).map((t) => [t.type, t]),
) as Record<RealmType, RealmTypeDefinition>;

export const TECHNOLOGY_SCALE: readonly string[] = technologyData.technology;
export const MAGIC_SCALE: readonly string[] = technologyData.magic;

export const AI_DENSITIES = ['MINIMAL', 'STANDARD', 'RICH', 'CINEMATIC'] as const;
export type AiDensity = (typeof AI_DENSITIES)[number];

export const CANONICAL_STRICTNESS = ['RELAXED', 'STANDARD', 'STRICT'] as const;
export type CanonicalStrictness = (typeof CANONICAL_STRICTNESS)[number];

export const PERSISTENCE_LEVELS = ['SESSION', 'SEASONAL', 'LONG_TERM', 'PERMANENT'] as const;
export type PersistenceLevel = (typeof PERSISTENCE_LEVELS)[number];

export const PVP_LEVELS = ['OFF', 'CONSENT', 'ZONED', 'OPEN'] as const;
export type PvpLevel = (typeof PVP_LEVELS)[number];

export const PROPERTY_RISKS = ['SAFE', 'CONTESTABLE', 'RAIDABLE'] as const;
export type PropertyRisk = (typeof PROPERTY_RISKS)[number];

/**
 * Categories of legal interaction a Realm recognises. A server may only use
 * mechanics whose category the Realm allows.
 */
export const INTERACTION_CATEGORIES = [
  'social',
  'trade',
  'gift',
  'contract',
  'property',
  'crafting',
  'farming',
  'exploration',
  'care',
  'investment',
  'politics',
  'learning',
  'creation',
  'crime',
  'duel',
  'war',
] as const;
export type InteractionCategory = (typeof INTERACTION_CATEGORIES)[number];

export interface TechnologyCeiling {
  technology: string;
  magic: string;
}

/** What may cross the Realm border, inbound or outbound. */
export interface BorderRule {
  /** Item categories allowed across. */
  categories: string[];
  /** Items above this ceiling may not cross (imports only meaningful). */
  maxTechnology: string;
  maxMagic: string;
  /** Items without provenance are refused. */
  requireProvenance: boolean;
}

/**
 * Cross-Realm transfer. The person, their identity and their history ALWAYS
 * travel ('carried'); this is fixed and cannot be configured away. Equipment
 * (items, currency, familiars) is governed by the Realm.
 */
export interface CrossRealmTransferRules {
  person: 'carried';
  identity: 'carried';
  history: 'carried';
  /** Reputation is local by nature; 'reference' lets a destination see — not inherit — it. */
  reputation: 'local' | 'reference';
  currency: 'none' | 'exchange';
  items: 'none' | 'within-ceiling' | 'listed';
  /** 'form-shift': the Familiar travels but takes the destination's Realm form. */
  familiars: 'none' | 'form-shift' | 'as-is';
}

export interface RealmEconomicRules {
  primaryCurrency: CurrencyId;
  marketVolatility: 'LOW' | 'NORMAL' | 'HIGH';
  /** Coin a new resident begins with, in minor units. */
  startingPurse: number;
}

export interface RealmConstitution {
  technologyCeiling: TechnologyCeiling;
  progression: { history: boolean; technology: boolean };
  imports: BorderRule;
  exports: BorderRule;
  economy: RealmEconomicRules;
  crossRealm: CrossRealmTransferRules;
  legalInteractions: InteractionCategory[];
  servers: {
    /** The preset the Realm launches with. */
    launchPreset: string;
    /** Presets a server of this Realm may run now. */
    allowedPresets: string[];
    /** Defined and architecturally compatible, but not enabled yet (e.g. consent-based war). */
    futureCompatiblePresets: string[];
    defaultPreset: string;
  };
  pvp: { max: PvpLevel };
  property: { ownershipAllowed: boolean; maxRisk: PropertyRisk };
  ai: { defaultDensity: AiDensity; maxDensity: AiDensity };
  /** Servers may be stricter than this, never looser. */
  canonicalStrictness: CanonicalStrictness;
  /** Longest persistence a server of this Realm may use. */
  persistence: PersistenceLevel;
}

export interface RealmDefinition {
  id: RealmId;
  name: string;
  type: RealmType;
  description: string;
  constitution: RealmConstitution;
  /** Free-form presentation metadata (art direction etc.). Not read by simulation. */
  presentation?: Record<string, unknown>;
}
