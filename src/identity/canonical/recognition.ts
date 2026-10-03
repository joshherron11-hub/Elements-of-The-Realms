import { err, ok, type Result } from '../../core/result';
import type { PersonId } from '../../core/refs';
import type { VerificationSource } from '../types';
import { ECONOMIC_SOURCE_SYSTEMS } from './guards';
import type { DerivedRecord } from './pipeline';

/**
 * RECOGNITION — RESERVED
 *
 * Verified Canonical Recognition is the final stage of the pipeline. It is
 * distinct from declared identity and from observed behavior. Recognition:
 *  - rests on a Signature-stage derived record,
 *  - is confirmed by an authorized verifier (never by the subject, never by
 *    payment or any economic system),
 *  - is never produced by owning things (property, Familiars, wealth).
 *
 * No service creates Recognition yet; only the shape and its guard exist.
 */
export interface Recognition {
  readonly id: string;
  readonly layer: 'recognized';
  readonly subject: PersonId;
  readonly signatureRecordId: string;
  readonly verifiedBy: VerificationSource;
  readonly verifiedAt: number;
  status: 'active' | 'withdrawn';
  /** Which identity contexts the person has chosen to show it in. */
  visibleIn: string[];
}

export function validateRecognition(
  r: Recognition,
  signature: DerivedRecord | undefined,
): Result<true> {
  if (r.layer !== 'recognized') return err('WRONG_LAYER', 'recognition must have layer "recognized"');
  if (!signature || signature.id !== r.signatureRecordId) return err('NO_SIGNATURE', 'recognition must rest on a Signature record');
  if (signature.stage !== 'SIGNATURE') return err('NOT_SIGNATURE', `basis is ${signature.stage}, not SIGNATURE`);
  if (signature.status !== 'provisional') return err('RETRACTED_BASIS', 'signature basis was retracted');
  if (signature.subject !== r.subject) return err('SUBJECT_MISMATCH', 'signature belongs to someone else');
  if (r.verifiedBy.kind !== 'authorized-verifier') return err('NOT_AUTHORIZED', 'only an authorized verifier can confirm Recognition');
  if (r.verifiedBy.id === r.subject) return err('SELF_RECOGNITION', 'nobody can recognize themself');
  if (ECONOMIC_SOURCE_SYSTEMS.has(r.verifiedBy.id)) return err('ECONOMIC_SOURCE', 'Recognition cannot be bought');
  return ok(true);
}
