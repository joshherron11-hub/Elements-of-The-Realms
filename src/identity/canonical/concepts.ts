import type { ActorId, PersonId, RealmId } from '../../core/refs';
import type { ChronicleEntry } from '../../chronicle/types';
import type { Evidence, Person } from '../types';

/**
 * RESERVED CANONICAL CONCEPTS
 *
 * Only two have a working definition today:
 *   Metastrate = an individual's accumulated experiential state
 *   Grandmeta  = collective accumulated historical memory
 * Both are implemented strictly as *indexes over raw records* — references and
 * counts, no interpretation, no scores.
 *
 * The rest are reserved names with no defined semantics. Do not attach values,
 * formulas or meanings to them without the Canon owner's definition.
 */
export const CANONICAL_CONCEPT_KEYS = [
  'GRANDMETA',
  'METASTRATE',
  'INFOSTRATE',
  'METATHYMOS',
  'METAMETRICS',
  'METASTRATEGY',
  'METAMETHODOLOGY_QUOTIENT',
] as const;
export type CanonicalConceptKey = (typeof CANONICAL_CONCEPT_KEYS)[number];

export interface CanonicalConceptDefinition {
  readonly key: CanonicalConceptKey;
  readonly name: string;
  readonly status: 'working-definition' | 'reserved';
  /** Plain-language definition, or null while reserved. */
  readonly definition: string | null;
}

/**
 * A slot for a reserved concept attached to a subject. It deliberately has
 * no value field: until defined, nothing may be stored in it.
 */
export interface ReservedConceptSlot {
  readonly concept: Exclude<CanonicalConceptKey, 'GRANDMETA' | 'METASTRATE'>;
  readonly status: 'reserved';
}

/** Metastrate: one person's accumulated experiential state, as raw-evidence index. */
export interface Metastrate {
  readonly concept: 'METASTRATE';
  readonly subject: PersonId;
  readonly asOf: number;
  /** Always private to the subject unless they choose otherwise. */
  readonly visibility: 'private';
  readonly evidenceIds: readonly string[];
  readonly firstAt?: number;
  readonly lastAt?: number;
  /** How many raw records exist per Realm (keyed by RealmId). Counts, not judgements. */
  readonly evidenceByRealm: Readonly<Record<string, number>>;
  /** How many raw records exist per action type. Counts, not judgements. */
  readonly evidenceByActionType: Readonly<Record<string, number>>;
}

/** Grandmeta: collective accumulated historical memory of a Realm, as Chronicle index. */
export interface Grandmeta {
  readonly concept: 'GRANDMETA';
  readonly scope: { readonly kind: 'realm'; readonly id: RealmId };
  readonly asOf: number;
  readonly entryIds: readonly string[];
  readonly firstAt?: number;
  readonly lastAt?: number;
  readonly entriesByEvent: Readonly<Record<string, number>>;
  readonly distinctParticipants: number;
}

const tally = (keys: string[]): Record<string, number> =>
  keys.reduce<Record<string, number>>((acc, k) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {});

/**
 * Build a Metastrate for a person from raw evidence across all of their
 * actors (one person, many Realms). Pure; reads only.
 */
export function buildMetastrate(person: Person, evidence: readonly Evidence[], asOf: number): Metastrate {
  const actorIds = new Set<ActorId>(Object.values(person.actors));
  const mine = evidence.filter((e) => actorIds.has(e.actor)).sort((a, b) => a.time - b.time);
  return {
    concept: 'METASTRATE',
    subject: person.id,
    asOf,
    visibility: 'private',
    evidenceIds: mine.map((e) => e.id),
    firstAt: mine[0]?.time,
    lastAt: mine.at(-1)?.time,
    evidenceByRealm: tally(mine.map((e) => e.context.realmId)),
    evidenceByActionType: tally(mine.map((e) => e.actionType)),
  };
}

/**
 * Build a Grandmeta for a Realm from its Chronicle. Only entries that are
 * already realm- or public-visible enter collective memory; private personal
 * history never does.
 */
export function buildGrandmeta(realmId: RealmId, chronicle: readonly ChronicleEntry[], asOf: number): Grandmeta {
  const collective = chronicle.filter(
    (e) => e.context.realmId === realmId && (e.visibility === 'realm' || e.visibility === 'public'),
  );
  const participants = new Set<string>();
  for (const e of collective) {
    if (e.actor) participants.add(e.actor);
    for (const p of e.participants) participants.add(p);
  }
  return {
    concept: 'GRANDMETA',
    scope: { kind: 'realm', id: realmId },
    asOf,
    entryIds: collective.map((e) => e.id),
    firstAt: collective[0]?.timestamp,
    lastAt: collective.at(-1)?.timestamp,
    entriesByEvent: tally(collective.map((e) => e.event)),
    distinctParticipants: participants.size,
  };
}
