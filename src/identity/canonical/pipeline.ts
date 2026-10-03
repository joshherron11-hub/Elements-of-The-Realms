import { err, ok, type Result } from '../../core/result';
import type { InteractionId, JsonValue, PersonId } from '../../core/refs';
import type { Provenance } from '../../core/provenance';
import { ECONOMIC_SOURCE_SYSTEMS, findForbiddenKeys } from './guards';

/**
 * THE CANONICAL PIPELINE — STRUCTURE ONLY
 *
 *   Interaction → Modalities → Constituencies → Dichotomies → Polarities
 *               → Affinity → Signature → Recognition
 *
 * No stage beyond Interaction has a defined meaning yet. These types reserve
 * the shape so future derivation can be added without restructuring storage.
 * No derivation is implemented, and none may be fabricated: the semantics of
 * each stage must come from the Canon owner.
 */
export const CANONICAL_STAGES = [
  'INTERACTION',
  'MODALITIES',
  'CONSTITUENCIES',
  'DICHOTOMIES',
  'POLARITIES',
  'AFFINITY',
  'SIGNATURE',
  'RECOGNITION',
] as const;

export type CanonicalStage = (typeof CANONICAL_STAGES)[number];
/** Every stage except the raw one is derived. */
export type DerivedStage = Exclude<CanonicalStage, 'INTERACTION'>;

export const stageIndex = (s: CanonicalStage): number => CANONICAL_STAGES.indexOf(s);
export const previousStage = (s: DerivedStage): CanonicalStage => CANONICAL_STAGES[stageIndex(s) - 1]!;

/** Identifies the (future) method that produced a derived record. */
export interface DerivationMethod {
  readonly id: string;
  readonly version: string;
  /** Must be approved by the Canon owner before any record using it is accepted. */
  readonly approved: boolean;
}

/**
 * A derived record at some stage. It always cites the records it came from
 * (in the immediately preceding stage), so it can be audited, recomputed or
 * retracted. Raw evidence is never modified by derivation.
 */
export interface DerivedRecord<S extends DerivedStage = DerivedStage> {
  readonly id: string;
  readonly layer: 'derived';
  readonly stage: S;
  readonly subject: PersonId;
  /** Ids of the inputs: InteractionIds for MODALITIES, else DerivedRecord ids of the previous stage. */
  readonly derivedFrom: readonly string[];
  readonly method: DerivationMethod;
  readonly computedAt: number;
  status: 'provisional' | 'retracted';
  /** Opaque until the stage is defined. Must not contain score/rank/worth keys. */
  readonly payload: Record<string, JsonValue>;
  readonly provenance: Provenance;
}

/**
 * Future derivation plug-in. Pure: (inputs) → derived records. Implementations
 * are intentionally absent.
 */
export interface CanonicalDeriver<S extends DerivedStage> {
  readonly stage: S;
  readonly method: DerivationMethod;
  derive(subject: PersonId, inputs: readonly { id: string }[], now: number): DerivedRecord<S>[];
}

/**
 * Validates a derived record against the Canon guardrails before it may be
 * stored. Lookup returns the stage of an input id (or undefined if unknown).
 */
export function validateDerivedRecord(
  record: DerivedRecord,
  lookupStage: (id: string) => CanonicalStage | undefined,
): Result<true> {
  if (record.layer !== 'derived') return err('WRONG_LAYER', 'derived records must have layer "derived"');
  if (!CANONICAL_STAGES.includes(record.stage) || record.stage === ('INTERACTION' as CanonicalStage)) {
    return err('BAD_STAGE', `unknown derived stage ${String(record.stage)}`);
  }
  if (!record.method.approved) return err('UNAPPROVED_METHOD', `derivation method ${record.method.id} is not approved by Canon`);
  if (!record.derivedFrom.length) return err('NO_BASIS', 'derived records must cite their inputs');
  if (record.provenance.origin !== 'derived') return err('BAD_PROVENANCE', 'derived records need derived provenance');
  if (ECONOMIC_SOURCE_SYSTEMS.has(record.provenance.sourceSystem)) {
    return err('ECONOMIC_SOURCE', 'the economic loop cannot author Canonical records');
  }
  const expected = previousStage(record.stage);
  for (const id of record.derivedFrom) {
    const s = lookupStage(id);
    if (s === undefined) return err('UNKNOWN_INPUT', `input ${id} does not exist`);
    if (s !== expected) return err('STAGE_SKIP', `${record.stage} must derive from ${expected}, got ${s}`);
  }
  const forbidden = findForbiddenKeys(record.payload);
  if (forbidden.length) return err('FORBIDDEN_FIELD', `payload contains forbidden fields: ${forbidden.join(', ')}`);
  return ok(true);
}

/** Hard floor from Canon: never assign an Orientation from one interaction. */
export const ORIENTATION_MIN_INTERACTIONS_FLOOR = 2;

/**
 * Reserved. An Orientation is a Canonical characterisation whose vocabulary
 * and pipeline placement are not yet defined. Only the evidence-basis rule
 * is enforced today.
 */
export interface OrientationAssignment {
  readonly subject: PersonId;
  /** Opaque key from a future Canon-approved vocabulary. */
  readonly orientation: string;
  /** The distinct raw interactions this assignment rests on. */
  readonly basis: readonly InteractionId[];
  readonly derivedFrom: readonly string[];
  readonly method: DerivationMethod;
  readonly assignedAt: number;
}

export interface OrientationPolicy {
  /** Never below ORIENTATION_MIN_INTERACTIONS_FLOOR, whatever is configured. */
  minDistinctInteractions: number;
}

export function validateOrientation(a: OrientationAssignment, policy: OrientationPolicy): Result<true> {
  const required = Math.max(ORIENTATION_MIN_INTERACTIONS_FLOOR, policy.minDistinctInteractions);
  const distinct = new Set(a.basis).size;
  if (distinct < required) {
    return err('INSUFFICIENT_BASIS', `an Orientation needs at least ${required} distinct interactions; got ${distinct}`);
  }
  if (!a.method.approved) return err('UNAPPROVED_METHOD', 'Orientation method is not approved by Canon');
  return ok(true);
}
