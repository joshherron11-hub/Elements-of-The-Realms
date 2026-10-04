import type {
  ActorId,
  EvidenceId,
  IdentityId,
  InteractionId,
  LocationId,
  PersonId,
  PlatformDomain,
  RealmId,
  ServerId,
} from '../core/refs';
import type { Provenance } from '../core/provenance';

/**
 * IDENTITY AND EVIDENCE — RAW LAYER
 *
 * Three kinds of record are kept strictly apart and never merged:
 *
 *   DECLARED  — what a person says about themself (DeclaredClaim, Identity.declared)
 *   OBSERVED  — raw evidence of what happened (Interaction + Evidence)
 *   RECOGNIZED — verified Canonical Recognition (reserved; see ./canonical)
 *
 * Declared identity ≠ observed behavior ≠ verified Recognition.
 */

/** Which layer a record belongs to. Carried on every identity/evidence record. */
export type RecordLayer = 'declared' | 'observed' | 'derived' | 'recognized';

/**
 * A Person is the one real human behind many contexts. A Person record holds
 * no score, rank, worth or suitability field — by design.
 */
export interface Person {
  readonly id: PersonId;
  displayName: string;
  createdAt: number;
  /** The person's actor in each Realm, keyed by RealmId. */
  actors: Record<string, ActorId>;
}

/**
 * Identity contexts. Canonical Evidence is not an identity context: it is a
 * separate evidence store (see Evidence) that contexts may reference only with
 * consent.
 */
export type IdentityContextKind =
  | 'UNIVERSAL'
  | 'REALM'
  | 'WORK'
  | 'LEARNING'
  | 'CREATOR'
  | 'PRIVATE'
  | 'SHARED';

export const IDENTITY_CONTEXTS: readonly IdentityContextKind[] = [
  'UNIVERSAL',
  'REALM',
  'WORK',
  'LEARNING',
  'CREATOR',
  'PRIVATE',
  'SHARED',
];

export type IdentityVisibility = 'private' | 'connections' | 'realm' | 'public';

/** A self-presented profile in one context. */
export interface Identity {
  readonly id: IdentityId;
  readonly layer: 'declared';
  personId: PersonId;
  context: IdentityContextKind;
  /** Required when context = 'REALM'. */
  realmId?: RealmId;
  displayName: string;
  /** What the person says about themself in this context. Never verified by default. */
  declared: Record<string, string>;
  visibility: IdentityVisibility;
  createdAt: number;
}

/** One self-declared statement, kept as an append-only log. */
export interface DeclaredClaim {
  readonly id: string;
  readonly layer: 'declared';
  readonly identityId: IdentityId;
  readonly personId: PersonId;
  readonly key: string;
  readonly value: string;
  readonly declaredAt: number;
}

/**
 * Explicit, revocable consent for one identity context to be visible from
 * another (e.g. let a WORK profile show a CREATOR portfolio). Without a link,
 * contexts do not see each other.
 */
export interface IdentityLink {
  readonly id: string;
  readonly personId: PersonId;
  readonly from: IdentityId;
  readonly to: IdentityId;
  readonly grantedAt: number;
  revokedAt?: number;
}

export type VerificationStatus = 'unverified' | 'system-observed' | 'witnessed' | 'verified' | 'disputed';

/**
 * Who may change verification status. There is intentionally no payment,
 * purchase or economic source: money cannot buy verification.
 */
export type VerificationSourceKind = 'system' | 'witness' | 'authorized-verifier';
export interface VerificationSource {
  readonly kind: VerificationSourceKind;
  readonly id: string;
  /** For authorized verifiers: the role they act in. Roles are configurable and not finalized. */
  readonly role?: string;
}

export interface VerificationChange {
  readonly at: number;
  readonly from: VerificationStatus;
  readonly to: VerificationStatus;
  readonly by: VerificationSource;
  readonly note?: string;
}

export interface EvidenceContext {
  realmId: RealmId;
  serverId: ServerId;
  domain: PlatformDomain;
  mode?: string;
}

/** A raw record that something happened. No interpretation. */
export interface Interaction {
  readonly id: InteractionId;
  readonly layer: 'observed';
  readonly actor: ActorId;
  readonly target?: { readonly kind: string; readonly id: string };
  readonly at: number;
  readonly location?: LocationId;
  readonly context: EvidenceContext;
  readonly actionType: string;
  readonly outcome?: string;
  readonly provenance: Provenance;
}

/**
 * The raw evidence fields — and only these — are stored for the Canonical
 * pipeline today. Nothing derived lives on an Evidence record.
 */
export interface RawEvidenceFields {
  readonly actor: ActorId;
  readonly target?: { readonly kind: string; readonly id: string };
  readonly time: number;
  readonly location?: LocationId;
  readonly context: EvidenceContext;
  readonly actionType: string;
  readonly outcome?: string;
  readonly provenance: Provenance;
  verification: VerificationStatus;
}

export interface Evidence extends RawEvidenceFields {
  readonly id: EvidenceId;
  readonly layer: 'observed';
  readonly interactionId: InteractionId;
  readonly observedBy: VerificationSource;
  readonly observedAt: number;
  /** Append-only verification history. */
  readonly verificationHistory: VerificationChange[];
}
