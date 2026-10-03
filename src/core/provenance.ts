import type { OwnerRef, RealmId } from './refs';

/**
 * Where something came from. Attached to ownership, items, chronicle entries,
 * evidence and anything else whose history matters.
 *
 * Provenance is descriptive record-keeping, never a score.
 */
export type ProvenanceOrigin =
  | 'authored' // shipped content (Realm data files)
  | 'system' // produced by a kernel system
  | 'actor' // produced by a player or NPC action
  | 'import' // arrived from another Realm/server
  | 'derived'; // computed from other records (must cite derivedFrom)

export interface Provenance {
  readonly origin: ProvenanceOrigin;
  readonly sourceSystem: string;
  readonly createdAt: number;
  readonly createdBy?: OwnerRef;
  readonly realmId?: RealmId;
  /** Ids of records this was derived from. Required in spirit when origin = 'derived'. */
  readonly derivedFrom?: readonly string[];
  readonly note?: string;
}

export function provenance(
  origin: ProvenanceOrigin,
  sourceSystem: string,
  createdAt: number,
  extra: Partial<Omit<Provenance, 'origin' | 'sourceSystem' | 'createdAt'>> = {},
): Provenance {
  if (origin === 'derived' && !(extra.derivedFrom && extra.derivedFrom.length)) {
    throw new Error('Derived provenance must cite derivedFrom');
  }
  return { origin, sourceSystem, createdAt, ...extra };
}
