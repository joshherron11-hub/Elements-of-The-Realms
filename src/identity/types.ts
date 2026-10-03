import type { ActorId, EvidenceId, IdentityId, InteractionId, LocationId, PersonId, RealmId, ServerId } from '../core/refs';
import type { Provenance } from '../core/provenance';

/**
 * A Person is the one real human behind many contexts. Identity contexts are
 * kept separate so a Realm persona, a work profile and a learning profile
 * never leak into each other without consent.
 */
export interface Person {
  readonly id: PersonId;
  displayName: string;
  createdAt: number;
  /** The person's actor in each Realm, keyed by RealmId. */
  actors: Record<string, ActorId>;
}

export type IdentityContextKind =
  | 'UNIVERSAL'
  | 'REALM'
  | 'WORK'
  | 'LEARNING'
  | 'CREATOR'
  | 'PRIVATE'
  | 'SHARED';

export type IdentityVisibility = 'private' | 'connections' | 'realm' | 'public';

/** A self-declared profile in one context. Declared ≠ observed ≠ recognised. */
export interface Identity {
  readonly id: IdentityId;
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

export type VerificationStatus = 'unverified' | 'system-observed' | 'witnessed' | 'verified' | 'disputed';

/**
 * A raw record that something happened. No interpretation.
 */
export interface Interaction {
  readonly id: InteractionId;
  readonly actor: ActorId;
  readonly target?: { readonly kind: string; readonly id: string };
  readonly at: number;
  readonly location?: LocationId;
  readonly context: { realmId: RealmId; serverId: ServerId; mode?: string; domain: string };
  readonly actionType: string;
  readonly outcome?: string;
  readonly provenance: Provenance;
}

/**
 * Raw evidence about an interaction: who/what observed it and how well it is
 * verified. Derived interpretation is never stored here.
 */
export interface Evidence {
  readonly id: EvidenceId;
  readonly interactionId: InteractionId;
  readonly observedBy: { readonly kind: 'system' | 'actor'; readonly id: string };
  readonly observedAt: number;
  verification: VerificationStatus;
  readonly provenance: Provenance;
}
