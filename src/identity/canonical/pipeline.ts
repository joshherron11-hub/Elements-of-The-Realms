import { err, ok, type Result } from '../../core/result';
import type { InteractionId, JsonValue, PersonId } from '../../core/refs';
import type { Provenance } from '../../core/provenance';
import { ECONOMIC_SOURCE_SYSTEMS, findForbiddenKeys } from './guards';
import {
  CANONICAL_INTERPRETATION_DISABLED,
  NEVER_FROM_SINGLE_INTERACTION,
  assessLadder,
  checkInterpretationConfig,
  ladderRank,
  type CanonEnvironment,
  type CanonicalInterpretationConfig,
  type LadderEvidence,
} from './ladder';

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
  config: CanonicalInterpretationConfig = CANONICAL_INTERPRETATION_DISABLED,
  env: CanonEnvironment = 'production',
): Result<true> {
  const usable = checkInterpretationConfig(config, env);
  if (!usable.ok) return usable;
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

/**
 * Reserved. An Orientation is a Canonical characterisation whose vocabulary
 * and pipeline placement are not yet defined.
 *
 * Orientation is NEVER assigned automatically. A proposal can only be
 * accepted when Canonical interpretation is enabled under an allowed policy,
 * its evidence reaches the policy's review level on the Recognition ladder,
 * and a named human review made the assignment.
 */
export interface OrientationAssignment {
  readonly subject: PersonId;
  /** Opaque key from a future Canon-approved vocabulary. */
  readonly orientation: string;
  /** The distinct raw interactions this assignment rests on. */
  readonly basis: readonly InteractionId[];
  readonly derivedFrom: readonly string[];
  readonly method: DerivationMethod;
  /** Who made the call. There is no automatic path. */
  readonly assignedBy: { readonly kind: 'review'; readonly reviewer: string } | { readonly kind: 'automatic' };
  readonly assignedAt: number;
}

export function validateOrientation(
  a: OrientationAssignment,
  basisEvidence: readonly LadderEvidence[],
  config: CanonicalInterpretationConfig = CANONICAL_INTERPRETATION_DISABLED,
  env: CanonEnvironment = 'production',
): Result<true> {
  const usable = checkInterpretationConfig(config, env);
  if (!usable.ok) return usable;
  if (a.assignedBy.kind !== 'review') return err('AUTOMATIC_ORIENTATION', 'Orientation is never assigned automatically');
  if (!a.method.approved) return err('UNAPPROVED_METHOD', 'Orientation method is not approved by Canon');
  const distinct = new Set(a.basis).size;
  if (distinct < NEVER_FROM_SINGLE_INTERACTION) return err('SINGLE_INTERACTION', 'an Orientation can never rest on a single interaction');
  const basis = basisEvidence.filter((e) => a.basis.includes(e.interactionId as InteractionId));
  if (new Set(basis.map((e) => e.interactionId)).size !== distinct) return err('UNKNOWN_BASIS', 'every basis interaction must be supplied as evidence');
  const ladder = assessLadder(basis, config, env);
  if (!ladder.ok) return ladder;
  if (ladderRank(ladder.value.level) < ladderRank(usable.value.orientationReviewLevel)) {
    return err('INSUFFICIENT_BASIS', `evidence reaches ${ladder.value.level}; review needs ${usable.value.orientationReviewLevel} under policy ${usable.value.id} (${usable.value.status})`);
  }
  return ok(true);
}
