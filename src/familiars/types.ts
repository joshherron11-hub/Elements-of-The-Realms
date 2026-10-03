import type { ActorId, ChronicleEntryId, FamiliarId, RealmId } from '../core/refs';
import type { Provenance } from '../core/provenance';

/**
 * A Familiar: companion, collectible, utility creature, historical object or
 * cultural symbol. Owner is resolved through the ownership registry
 * (asset kind 'familiar'). Owning a Familiar never defines Canonical Recognition.
 */
export interface FamiliarCareState {
  /** 0 (starving) … 100 (full). */
  satiety: number;
  /** 0 (exhausted) … 100 (rested). */
  energy: number;
  /** 0 … 100 */
  mood: number;
  lastFedAt?: number;
  lastRestedAt?: number;
  lastBondedAt?: number;
}

export interface Familiar {
  readonly id: FamiliarId;
  /** The actor representing it in the world. */
  actorId: ActorId;
  species: string;
  name: string;
  variant: string;
  /** How this Familiar presents in a given Realm (keyed by RealmId). */
  realmForms: Record<string, string>;
  temperament: string;
  /** 0 … 100, how strong the bond with its owner is. */
  bond: number;
  originRealmId: RealmId;
  utilityTags: string[];
  care: FamiliarCareState;
  provenance: Provenance;
  /** Chronicle entries about this Familiar. */
  history: ChronicleEntryId[];
}
