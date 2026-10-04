import type { Id } from './ids';

/**
 * Shared identifier aliases and reference shapes used across every system.
 * These are deliberately Realm-agnostic.
 */
export type PersonId = Id<'person'>;
export type IdentityId = Id<'identity'>;
export type ActorId = Id<'actor'>;
export type RealmId = Id<'realm'>;
export type ServerId = Id<'server'>;
export type OrganizationId = Id<'org'>;
export type RoleId = Id<'role'>;
export type AuthorityGrantId = Id<'grant'>;
export type LocationId = Id<'location'>;
export type RouteId = Id<'route'>;
export type PropertyId = Id<'property'>;
export type ItemId = Id<'item'>;
export type ItemInstanceId = Id<'iteminst'>;
export type CurrencyId = Id<'currency'>;
export type LedgerEntryId = Id<'ledger'>;
export type MarketId = Id<'market'>;
export type ResourceId = Id<'resource'>;
export type ResourceNodeId = Id<'rnode'>;
export type ContractId = Id<'contract'>;
export type TaskId = Id<'task'>;
export type RiskProfileId = Id<'risk'>;
export type FamiliarId = Id<'familiar'>;
export type ChronicleEntryId = Id<'chron'>;
export type InteractionId = Id<'interaction'>;
export type EvidenceId = Id<'evidence'>;

/**
 * The four platform domains. Every contract, task, organization and chronicle
 * entry carries one, so the same kernel can later host Learn/Work/Create.
 */
export type PlatformDomain = 'PLAY' | 'LEARN' | 'WORK' | 'CREATE';

/** Something that can hold things: a person-in-a-realm (actor) or a group. */
export type OwnerRef =
  | { readonly kind: 'actor'; readonly id: ActorId }
  | { readonly kind: 'organization'; readonly id: OrganizationId };

/**
 * Something that can be owned as a distinct asset. Fungible goods live in
 * inventories; currency lives in wallets. Extend the kind union as new asset
 * classes appear (e.g. 'artifact' for Create/Work).
 */
export type AssetKind = 'property' | 'familiar' | 'item-instance' | 'investment' | 'artifact';
export interface AssetRef {
  readonly kind: AssetKind;
  readonly id: string;
}

/** Where a permission, reputation or record applies. */
export type ScopeKind = 'global' | 'realm' | 'server' | 'location' | 'property' | 'organization';
export interface ScopeRef {
  readonly kind: ScopeKind;
  readonly id?: string;
}

export const actorRef = (id: ActorId): OwnerRef => ({ kind: 'actor', id });
export const orgRef = (id: OrganizationId): OwnerRef => ({ kind: 'organization', id });

/** Stable string key for a reference — used as a record key in WorldState. */
export const refKey = (ref: { kind: string; id?: string }): string => `${ref.kind}:${ref.id ?? '*'}`;

export const sameRef = (a: { kind: string; id?: string }, b: { kind: string; id?: string }): boolean =>
  a.kind === b.kind && a.id === b.id;

/** JSON-safe value, for open-ended data fields that must survive save/load. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
