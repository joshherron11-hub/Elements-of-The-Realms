import type {
  ActorId,
  ChronicleEntryId,
  JsonValue,
  LocationId,
  OrganizationId,
  PlatformDomain,
  RealmId,
  ServerId,
} from '../core/refs';
import type { Provenance } from '../core/provenance';

/**
 * The Chronicle is the continuous history of the world. Entries are structured
 * data first; prose can be generated later from them. Append-only: a
 * correction is a new entry that cites the one it corrects.
 */
export type ChronicleVisibility = 'private' | 'shared' | 'organization' | 'realm' | 'public';

export type ChronicleScope =
  | { readonly kind: 'personal'; readonly id: ActorId }
  | { readonly kind: 'organization'; readonly id: OrganizationId }
  | { readonly kind: 'realm'; readonly id: RealmId };

export interface ChronicleContext {
  realmId: RealmId;
  serverId: ServerId;
  domain: PlatformDomain;
  mode?: string;
}

export interface ChronicleEntry {
  readonly id: ChronicleEntryId;
  readonly timestamp: number;
  /** The primary actor, if any. */
  readonly actor?: ActorId;
  /** Event type, e.g. 'contract.completed'. */
  readonly event: string;
  readonly location?: LocationId;
  readonly context: ChronicleContext;
  readonly participants: ActorId[];
  readonly outcome?: string;
  /** One short human-readable line. Generated prose is a separate, later layer. */
  readonly summary?: string;
  readonly data?: Record<string, JsonValue>;
  readonly provenance: Provenance;
  readonly visibility: ChronicleVisibility;
  readonly sourceSystem: string;
  readonly scopes: ChronicleScope[];
  /** If this entry corrects an earlier one. */
  readonly corrects?: ChronicleEntryId;
}
