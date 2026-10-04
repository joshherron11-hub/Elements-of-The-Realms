import { err, ok, type Result } from '../../core/result';
import type { VerificationStatus } from '../types';

/**
 * RECOGNITION LADDER — STRUCTURE ONLY, THRESHOLDS UNFINALIZED
 *
 *   FIRST READ → OBSERVED → REPEATED → CROSS-CONTEXT → STABLE → RECOGNITION
 *
 * Canonical Recognition thresholds are NOT finalized. Nothing in this file is
 * Canon. Thresholds are configuration, may differ per stage, and may depend on
 * repetition, context diversity, verification quality, cross-context evidence
 * and time. Production Canonical interpretation stays DISABLED until the
 * methodology is explicitly approved by the project owner.
 *
 * Declared ≠ Observed ≠ Verified. Orientation is never assigned automatically,
 * and Recognition is never granted by this ladder — reaching the top only
 * makes a case eligible for human review.
 */
export const RECOGNITION_LADDER = ['FIRST_READ', 'OBSERVED', 'REPEATED', 'CROSS_CONTEXT', 'STABLE', 'RECOGNITION'] as const;
export type RecognitionLevel = (typeof RECOGNITION_LADDER)[number];
export type ThresholdedLevel = Exclude<RecognitionLevel, 'FIRST_READ'>;

/**
 * TEST_ONLY    — fixtures for exercising the software pipeline; never Canon; refused outside tests.
 * PROVISIONAL  — working proposals for development builds; refused in production.
 * APPROVED     — explicitly approved methodology; the only status production accepts.
 */
export type ThresholdStatus = 'TEST_ONLY' | 'PROVISIONAL' | 'APPROVED';
export type CanonEnvironment = 'production' | 'development' | 'test';

export interface StageThreshold {
  /** Distinct raw interactions counted. */
  minDistinctInteractions: number;
  /** Occurrences of the same kind of action. */
  minRepetitions: number;
  /** Distinct contexts (Realm / domain / mode) the evidence comes from. */
  minDistinctContexts: number;
  /** Weakest verification an item may have to count at this stage. */
  minVerification: VerificationStatus;
  /** Evidence must span more than one identity / Realm context. */
  requireCrossContext: boolean;
  /** Time between first and last counted evidence. */
  minSpanMs: number;
}

export interface RecognitionThresholdPolicy {
  id: string;
  version: string;
  status: ThresholdStatus;
  /** Why these numbers exist and who may change them. */
  note: string;
  stages: Record<ThresholdedLevel, StageThreshold>;
  /** The ladder level an Orientation proposal must reach before review is even possible. */
  orientationReviewLevel: ThresholdedLevel;
}

export interface CanonicalInterpretationConfig {
  /** Master switch. False by default; production stays off until methodology approval. */
  enabled: boolean;
  policy?: RecognitionThresholdPolicy;
}

/** The default everywhere: no Canonical interpretation at all. */
export const CANONICAL_INTERPRETATION_DISABLED: CanonicalInterpretationConfig = { enabled: false };

/**
 * TEST_ONLY fixture. These numbers exist only so tests can exercise the
 * pipeline end to end. They are NOT Canonical thresholds and are refused
 * outside the test environment.
 */
export const TEST_ONLY_RECOGNITION_THRESHOLDS: RecognitionThresholdPolicy = {
  id: 'test-only-fixture',
  version: '0',
  status: 'TEST_ONLY',
  note: 'TEST_ONLY development fixture for exercising the software pipeline. Not Canon. Real thresholds are unfinalized.',
  stages: {
    OBSERVED: { minDistinctInteractions: 1, minRepetitions: 1, minDistinctContexts: 1, minVerification: 'system-observed', requireCrossContext: false, minSpanMs: 0 },
    REPEATED: { minDistinctInteractions: 2, minRepetitions: 2, minDistinctContexts: 1, minVerification: 'system-observed', requireCrossContext: false, minSpanMs: 0 },
    CROSS_CONTEXT: { minDistinctInteractions: 3, minRepetitions: 2, minDistinctContexts: 2, minVerification: 'system-observed', requireCrossContext: true, minSpanMs: 0 },
    STABLE: { minDistinctInteractions: 4, minRepetitions: 3, minDistinctContexts: 2, minVerification: 'witnessed', requireCrossContext: true, minSpanMs: 1000 },
    RECOGNITION: { minDistinctInteractions: 5, minRepetitions: 3, minDistinctContexts: 2, minVerification: 'verified', requireCrossContext: true, minSpanMs: 2000 },
  },
  orientationReviewLevel: 'STABLE',
};

export const TEST_ONLY_INTERPRETATION: CanonicalInterpretationConfig = { enabled: true, policy: TEST_ONLY_RECOGNITION_THRESHOLDS };

/**
 * Invariant (Canon rule, not a threshold): an Orientation can never rest on a
 * single interaction. Real minimums come from an approved policy and will be
 * far stricter; this only rules out the degenerate case.
 */
export const NEVER_FROM_SINGLE_INTERACTION = 2;

/** Can this configuration be used in this environment? */
export function checkInterpretationConfig(config: CanonicalInterpretationConfig, env: CanonEnvironment): Result<RecognitionThresholdPolicy> {
  if (!config.enabled) return err('INTERPRETATION_DISABLED', 'Canonical interpretation is disabled until its methodology is approved');
  const p = config.policy;
  if (!p) return err('NO_POLICY', 'no Recognition threshold policy configured');
  if (p.status === 'TEST_ONLY' && env !== 'test') return err('TEST_ONLY_POLICY', `policy ${p.id} is TEST_ONLY and cannot run in ${env}`);
  if (p.status === 'PROVISIONAL' && env === 'production') return err('PROVISIONAL_POLICY', `policy ${p.id} is PROVISIONAL and cannot run in production`);
  return ok(p);
}

/** Raw evidence, reduced to what the ladder may look at. No interpretation. */
export interface LadderEvidence {
  interactionId: string;
  actionType: string;
  /** e.g. `${realmId}|${domain}|${mode}` */
  contextKey: string;
  /** Identity / Realm context the evidence belongs to (for cross-context checks). */
  identityContext: string;
  verification: VerificationStatus;
  at: number;
}

const VERIFICATION_STRENGTH: Record<VerificationStatus, number> = { disputed: -1, unverified: 0, 'system-observed': 1, witnessed: 2, verified: 3 };

export interface LadderAssessment {
  /** Highest level reached. Never RECOGNITION: that only marks eligibility for review. */
  level: Exclude<RecognitionLevel, 'RECOGNITION'>;
  eligibleForRecognitionReview: boolean;
  policy: { id: string; version: string; status: ThresholdStatus };
}

function meets(ev: readonly LadderEvidence[], t: StageThreshold): boolean {
  const counted = ev.filter((e) => VERIFICATION_STRENGTH[e.verification] >= VERIFICATION_STRENGTH[t.minVerification]);
  if (new Set(counted.map((e) => e.interactionId)).size < t.minDistinctInteractions) return false;
  const byAction = new Map<string, number>();
  for (const e of counted) byAction.set(e.actionType, (byAction.get(e.actionType) ?? 0) + 1);
  if (Math.max(0, ...byAction.values()) < t.minRepetitions) return false;
  if (new Set(counted.map((e) => e.contextKey)).size < t.minDistinctContexts) return false;
  if (t.requireCrossContext && new Set(counted.map((e) => e.identityContext)).size < 2) return false;
  const times = counted.map((e) => e.at);
  if (times.length && Math.max(...times) - Math.min(...times) < t.minSpanMs) return false;
  return true;
}

/**
 * Where does a body of raw evidence sit on the ladder under a configured
 * policy? Pure; refuses when interpretation is disabled or the policy is not
 * allowed in this environment. Grants nothing.
 */
export function assessLadder(evidence: readonly LadderEvidence[], config: CanonicalInterpretationConfig, env: CanonEnvironment): Result<LadderAssessment> {
  const checked = checkInterpretationConfig(config, env);
  if (!checked.ok) return checked;
  const p = checked.value;
  let level: LadderAssessment['level'] | undefined = evidence.length ? 'FIRST_READ' : undefined;
  if (!level) return err('NO_EVIDENCE', 'nothing has been observed');
  for (const stage of ['OBSERVED', 'REPEATED', 'CROSS_CONTEXT', 'STABLE'] as const) {
    if (!meets(evidence, p.stages[stage])) break;
    level = stage;
  }
  const eligible = level === 'STABLE' && meets(evidence, p.stages.RECOGNITION);
  return ok({ level, eligibleForRecognitionReview: eligible, policy: { id: p.id, version: p.version, status: p.status } });
}

export const ladderRank = (l: RecognitionLevel): number => RECOGNITION_LADDER.indexOf(l);

/* ------------------------------------------------------------------ */
/* Authorized verifiers — configurable, UNFINALIZED                    */
/* ------------------------------------------------------------------ */

/**
 * Who may mark evidence 'verified'. Roles are not finalized: by default no
 * role is authorized, so nothing can be marked 'verified' outside tests.
 */
export interface VerifierPolicy {
  status: 'UNFINALIZED' | 'TEST_ONLY' | 'APPROVED';
  roles: string[];
}

export const VERIFIER_ROLES_UNFINALIZED: VerifierPolicy = { status: 'UNFINALIZED', roles: [] };

/** TEST_ONLY: lets tests exercise verification. Not a decision about who verifies. */
export const TEST_ONLY_VERIFIER_POLICY: VerifierPolicy = { status: 'TEST_ONLY', roles: ['test-verifier', 'test-teacher', 'test-registrar'] };

/** Canon configuration a simulation runs with. Defaults: everything off. */
export interface CanonConfig {
  environment: CanonEnvironment;
  interpretation: CanonicalInterpretationConfig;
  verifiers: VerifierPolicy;
}

export const DEFAULT_CANON_CONFIG: CanonConfig = {
  environment: 'production',
  interpretation: CANONICAL_INTERPRETATION_DISABLED,
  verifiers: VERIFIER_ROLES_UNFINALIZED,
};

/** For tests only: interpretation and verification enabled with TEST_ONLY fixtures. */
export const TEST_ONLY_CANON_CONFIG: CanonConfig = {
  environment: 'test',
  interpretation: TEST_ONLY_INTERPRETATION,
  verifiers: TEST_ONLY_VERIFIER_POLICY,
};

export function verifierAllowed(policy: VerifierPolicy, env: CanonEnvironment, role: string | undefined): Result<true> {
  if (policy.status === 'UNFINALIZED') return err('VERIFIER_ROLES_UNFINALIZED', 'authorized verifier roles are not finalized yet');
  if (policy.status === 'TEST_ONLY' && env !== 'test') return err('TEST_ONLY_POLICY', 'TEST_ONLY verifier roles cannot be used outside tests');
  if (!role || !policy.roles.includes(role)) return err('NOT_AUTHORIZED', `role ${role ?? '(none)'} is not an authorized verifier role`);
  return ok(true);
}
