import type { ActorId, ChronicleEntryId, CurrencyId, FamiliarId, RealmId } from '../core/refs';
import type { Provenance } from '../core/provenance';

/**
 * FAMILIARS
 *
 * A Familiar may be a companion, a collectible, a utility creature, a
 * historical object, a relationship entity, or a cultural / political symbol.
 * Its owner is resolved through the shared ownership registry (asset kind
 * 'familiar'), never stored on the Familiar.
 *
 * Owning a Familiar NEVER defines Canonical Recognition. This module has no
 * dependency on identity or Canonical code, by design and by test.
 */
export type FamiliarRole = 'companion' | 'utility' | 'collectible' | 'symbol';

/** Authored species data. */
export interface FamiliarSpecies {
  readonly id: string;
  name: string;
  role: FamiliarRole;
  /** Item tags this species eats, e.g. 'hound-food'. */
  diet: string[];
  /** Care points lost per simulated hour. */
  satietyDecayPerHour: number;
  energyDecayPerHour: number;
  /** Whether owned individuals travel with their owner. */
  followsOwner: boolean;
  utilityTags: string[];
  /** Default appearance per Realm (keyed by RealmId). */
  realmForms: Record<string, string>;
  /** Presentation hint for the renderer ('hound', 'moth', 'bird'). */
  figure: string;
  description?: string;
}

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
  /** Species id. */
  species: string;
  name: string;
  variant: string;
  /** How this individual presents in each Realm (keyed by RealmId); overrides the species default. */
  realmForms: Record<string, string>;
  temperament: string;
  /** 0 … 100: the bond with its current owner. Resets when ownership changes. */
  bond: number;
  originRealmId: RealmId;
  utilityTags: string[];
  care: FamiliarCareState;
  /** Present while the current owner is offering it to someone new. */
  offer?: { price: number; currencyId: CurrencyId };
  provenance: Provenance;
  /** Chronicle entries about this Familiar, oldest first. */
  history: ChronicleEntryId[];
}
