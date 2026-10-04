import type { RealmId, ServerId } from '../core/refs';
import type { AiDensity, CanonicalStrictness, PersistenceLevel, PropertyRisk, PvpLevel } from './realm';

/**
 * SERVER CONSTITUTIONS
 *
 * A server is one running instance of a Realm. Its constitution is a preset
 * (authored data) plus owner overrides, validated against the Realm
 * Constitution and the current release.
 */
export const SERVER_PRESETS = [
  'PEACEFUL',
  'PRIVATE',
  'FAMILY_FRIENDS',
  'CONSENT_WAR',
  'PROTECTED_CIVILIAN',
  'FULL_CONFLICT',
  'CURATED_ROLEPLAY',
  'EXPERIMENTAL',
  'FROZEN_ERA',
  'PROGRESSIVE_ERA',
] as const;
export type ServerPreset = (typeof SERVER_PRESETS)[number];

export const WAR_LEVELS = ['OFF', 'CONSENT', 'ZONED', 'FULL'] as const;
export const ECONOMIC_RISKS = ['LOW', 'NORMAL', 'HIGH'] as const;
export const CRIME_LEVELS = ['NONE', 'NPC_ONLY', 'PLAYER'] as const;
export const FAMILIAR_DANGERS = ['NONE', 'LOW', 'MODERATE', 'HIGH'] as const;
export const TECHNOLOGY_MODES = ['FIXED', 'PROGRESSIVE'] as const;
export const HISTORY_MODES = ['PROGRESSIVE', 'FROZEN'] as const;
export const POLITICS_LEVELS = ['NONE', 'LIGHT', 'ACTIVE', 'FULL'] as const;
export const ACCESS_LEVELS = ['PRIVATE', 'INVITE', 'PUBLIC'] as const;

export interface ServerVariables {
  war: (typeof WAR_LEVELS)[number];
  pvp: PvpLevel;
  propertyRisk: PropertyRisk;
  economicRisk: (typeof ECONOMIC_RISKS)[number];
  crime: (typeof CRIME_LEVELS)[number];
  familiarDanger: (typeof FAMILIAR_DANGERS)[number];
  technology: (typeof TECHNOLOGY_MODES)[number];
  history: (typeof HISTORY_MODES)[number];
  politics: (typeof POLITICS_LEVELS)[number];
  persistence: PersistenceLevel;
  access: (typeof ACCESS_LEVELS)[number];
  canonicalStrictness: CanonicalStrictness;
  aiDensity: AiDensity;
}

export const SERVER_VARIABLE_KEYS = [
  'war',
  'pvp',
  'propertyRisk',
  'economicRisk',
  'crime',
  'familiarDanger',
  'technology',
  'history',
  'politics',
  'persistence',
  'access',
  'canonicalStrictness',
  'aiDensity',
] as const satisfies readonly (keyof ServerVariables)[];

/** A preset as authored in /server-constitutions. */
export interface ServerConstitution {
  preset: ServerPreset;
  name: string;
  description: string;
  variables: ServerVariables;
  /** Which variables a server owner may override. */
  ownerOverridable: (keyof ServerVariables)[];
}

/** A concrete server as authored under a Realm (e.g. realms/happy-fall/servers). */
export interface ServerDefinition {
  id: ServerId;
  name: string;
  realmId: RealmId;
  preset: ServerPreset;
  overrides: Partial<ServerVariables>;
}
