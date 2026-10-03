import type { RealmId, ServerId } from '../core/refs';
import { Rng, type RngState } from '../core/rng';
import type { Actor } from '../entities/actor';
import type { AuthorityGrant } from '../entities/authority';
import type { ItemDefinition, ItemInstance } from '../entities/item';
import type { Organization, Role } from '../entities/organization';
import type { Relationship } from '../entities/relationship';
import type { Reputation } from '../entities/reputation';
import type {
  CurrencyDefinition,
  Inventory,
  LedgerEntry,
  Market,
  OwnershipRecord,
  Property,
  ResourceDefinition,
  ResourceNode,
  RiskProfile,
  Wallet,
} from '../economy/types';
import type { Contract, Task } from '../contracts/types';
import type { ChronicleEntry } from '../chronicle/types';
import type { Familiar } from '../familiars/types';
import type { DeclaredClaim, Evidence, Identity, IdentityLink, Interaction, Person } from '../identity/types';
import type { DerivedRecord } from '../identity/canonical/pipeline';
import type { Recognition } from '../identity/canonical/recognition';
import type { Location, RealmRef, Route, ServerRef } from './types';
import type { SearchSpot } from './search';

export const WORLD_SCHEMA_VERSION = 1;

/**
 * The complete simulation state of one running world. Plain data only — no
 * class instances, functions, Maps or Dates — so it serialises to JSON as-is.
 * Records are keyed by id (or by refKey for owner-keyed records).
 */
export interface WorldState {
  schemaVersion: number;
  realm: RealmRef;
  server: ServerRef;
  createdAt: number;
  rng: RngState;

  persons: Record<string, Person>;
  identities: Record<string, Identity>;
  /** Append-only log of self-declared statements (DECLARED layer). */
  claims: DeclaredClaim[];
  identityLinks: IdentityLink[];
  actors: Record<string, Actor>;

  organizations: Record<string, Organization>;
  roles: Record<string, Role>;
  authority: Record<string, AuthorityGrant>;

  locations: Record<string, Location>;
  routes: Record<string, Route>;
  /** ActorId → discovered LocationIds. */
  discoveries: Record<string, string[]>;
  searchSpots: Record<string, SearchSpot>;
  /** ActorId → the mode they are currently in. */
  activeModes: Record<string, string>;

  items: Record<string, ItemDefinition>;
  itemInstances: Record<string, ItemInstance>;
  /** refKey(owner) → inventory */
  inventories: Record<string, Inventory>;

  currencies: Record<string, CurrencyDefinition>;
  /** refKey(owner) → wallet */
  wallets: Record<string, Wallet>;
  ledger: LedgerEntry[];

  markets: Record<string, Market>;
  resources: Record<string, ResourceDefinition>;
  resourceNodes: Record<string, ResourceNode>;
  properties: Record<string, Property>;
  /** refKey(asset) → ownership record */
  ownership: Record<string, OwnershipRecord>;
  risks: Record<string, RiskProfile>;

  contracts: Record<string, Contract>;
  tasks: Record<string, Task>;

  /** `${from}->${to}` → relationship */
  relationships: Record<string, Relationship>;
  /** `${refKey(subject)}@${refKey(scope)}` → reputation */
  reputations: Record<string, Reputation>;

  familiars: Record<string, Familiar>;

  chronicle: ChronicleEntry[];
  interactions: Record<string, Interaction>;
  evidence: Record<string, Evidence>;
  /**
   * Reserved Canonical storage. Derived records and Recognition stay empty
   * until Canon defines the derivation methods. Kept apart from raw evidence.
   */
  canonical: {
    derived: Record<string, DerivedRecord>;
    recognitions: Record<string, Recognition>;
  };

  /** Small open-ended world flags (quest gates, toggles). */
  flags: Record<string, string | number | boolean>;
}

export interface NewWorldOptions {
  realm: { id: RealmId; name: string; type: RealmRef['type'] };
  server: { id: ServerId; name: string; preset: string };
  seed: number;
  now: number;
}

export function createWorldState(opts: NewWorldOptions): WorldState {
  return {
    schemaVersion: WORLD_SCHEMA_VERSION,
    realm: { ...opts.realm },
    server: { ...opts.server, realmId: opts.realm.id },
    createdAt: opts.now,
    rng: Rng.createState(opts.seed),
    persons: {},
    identities: {},
    claims: [],
    identityLinks: [],
    actors: {},
    organizations: {},
    roles: {},
    authority: {},
    locations: {},
    routes: {},
    discoveries: {},
    searchSpots: {},
    activeModes: {},
    items: {},
    itemInstances: {},
    inventories: {},
    currencies: {},
    wallets: {},
    ledger: [],
    markets: {},
    resources: {},
    resourceNodes: {},
    properties: {},
    ownership: {},
    risks: {},
    contracts: {},
    tasks: {},
    relationships: {},
    reputations: {},
    familiars: {},
    chronicle: [],
    interactions: {},
    evidence: {},
    canonical: { derived: {}, recognitions: {} },
    flags: {},
  };
}
