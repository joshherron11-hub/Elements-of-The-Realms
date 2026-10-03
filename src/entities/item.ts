import type { ItemId, ItemInstanceId, RealmId } from '../core/refs';
import type { Provenance } from '../core/provenance';

/**
 * Item definitions are catalogue entries (authored data). Fungible items are
 * held as stacks in inventories; unique, history-bearing items become
 * ItemInstances that can be owned as assets.
 */
export interface ItemDefinition {
  readonly id: ItemId;
  name: string;
  category: string; // 'food', 'tool', 'trade-good', 'document', ...
  tags: string[];
  /** Reference value in the minor units of the Realm's main currency. */
  baseValue: number;
  stackable: boolean;
  /** Technology tier, checked against Realm constitutions for imports. */
  techTier?: string;
  /** Magic tier, checked against Realm constitutions. */
  magicTier?: string;
  originRealmId?: RealmId;
  description?: string;
}

export interface ItemInstance {
  readonly id: ItemInstanceId;
  itemId: ItemId;
  name?: string;
  attributes: Record<string, string | number | boolean>;
  provenance: Provenance;
}
