import type { ActorId, LocationId, PersonId, RealmId } from '../core/refs';
import type { Provenance } from '../core/provenance';

/**
 * An Actor is anything that acts inside a Realm: a player's presence, an NPC,
 * a Familiar, or a system agent. A real person (Person) may have many Actors —
 * one per Realm — which is how "your person travels further than your
 * equipment": the Person crosses Realms, each Actor stays local.
 */
export type ActorKind = 'player' | 'npc' | 'familiar' | 'system';

/** Who drives the actor's decisions. Deterministic NPC logic is 'scripted'. */
export type ActorController = 'human' | 'scripted' | 'ai-assisted' | 'none';

/**
 * Authored, deterministic presentation of an actor: what they are called and
 * what they say. AI-generated dialogue may be layered on later; this is the
 * baseline that needs no AI.
 */
export interface ActorProfile {
  title?: string;
  description?: string;
  greeting?: string;
  lines?: string[];
}

export interface Actor {
  readonly id: ActorId;
  kind: ActorKind;
  name: string;
  realmId: RealmId;
  /** The Person behind a player actor. NPCs have none. */
  personId?: PersonId;
  locationId?: LocationId;
  controller: ActorController;
  /** Free-form descriptive tags, e.g. 'innkeeper', 'merchant'. Not permissions. */
  tags: string[];
  profile?: ActorProfile;
  createdAt: number;
  provenance: Provenance;
}
