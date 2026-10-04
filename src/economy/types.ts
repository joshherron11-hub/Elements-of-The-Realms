import type {
  AssetRef,
  CurrencyId,
  ItemId,
  LedgerEntryId,
  LocationId,
  MarketId,
  OwnerRef,
  PropertyId,
  RealmId,
  ResourceId,
  ResourceNodeId,
  RiskProfileId,
} from '../core/refs';
import type { Provenance } from '../core/provenance';

/** Currencies are integer-based: all amounts are in minor units (no floats). */
export interface CurrencyDefinition {
  readonly id: CurrencyId;
  name: string;
  symbol: string;
  /** Minor units per major unit, e.g. 100 pennies per crown. Display only. */
  minorPerMajor: number;
  /** The Realm that issues it. Cross-Realm movement is governed by constitutions. */
  realmId?: RealmId;
}

/** Balances held by one owner. Keyed by CurrencyId. */
export interface Wallet {
  readonly holder: OwnerRef;
  balances: Record<string, number>;
}

/** Fungible items held by one owner. Keyed by ItemId. */
export interface Inventory {
  readonly holder: OwnerRef;
  stacks: Record<string, number>;
  /** Optional maximum total quantity. */
  capacity?: number;
}

/** Every currency movement leaves a ledger line. Append-only. */
export interface LedgerEntry {
  readonly id: LedgerEntryId;
  readonly at: number;
  readonly currencyId: CurrencyId;
  readonly amount: number;
  /** Absent for minting (money entering the economy). */
  readonly from?: OwnerRef;
  /** Absent for burning (money leaving the economy). */
  readonly to?: OwnerRef;
  readonly reason: string;
  readonly sourceSystem: string;
  readonly ref?: string;
}

export interface MarketListing {
  /** Reference price per unit in minor units before the market's price index. */
  basePrice: number;
  /** Players may buy this from the vendor. */
  buyable: boolean;
  /** Players may sell this to the vendor. */
  sellable: boolean;
  /** Fraction knocked off when the vendor buys (0 … 1). */
  sellSpread: number;
}

/**
 * A market is a price table attached to a vendor. Stock lives in the vendor's
 * ordinary inventory and takings in its ordinary wallet, so markets reuse
 * inventory and economy logic instead of duplicating it.
 */
export interface Market {
  readonly id: MarketId;
  name: string;
  locationId?: LocationId;
  vendor: OwnerRef;
  currencyId: CurrencyId;
  listings: Record<string, MarketListing>; // keyed by ItemId
  /** Multiplier applied to all prices; drifts with market conditions. 1 = normal. */
  priceIndex: number;
  /** Optional periodic price drift resolved through a risk profile (non-combat market risk). */
  drift?: { riskProfileId: RiskProfileId; everyMs: number; nextAt?: number };
  /** In-game day of the last morning restock. */
  lastRestockDay?: number;
}

/** A raw resource type (grain, timber, ore) and the item it yields when gathered. */
export interface ResourceDefinition {
  readonly id: ResourceId;
  name: string;
  yieldsItemId: ItemId;
}

/** A concrete source of a resource in the world. */
export interface ResourceNode {
  readonly id: ResourceNodeId;
  resourceId: ResourceId;
  locationId: LocationId;
  amount: number;
  capacity: number;
  /** Units regenerated per simulated hour. */
  regenPerHour: number;
}

export type PropertyKind = 'plot' | 'house' | 'shop' | 'farm' | 'stall' | 'warehouse' | 'land';

/**
 * Property is land or a building. Who owns it lives in the ownership registry,
 * not on the property, so every asset type shares one ownership model.
 */
export interface Property {
  readonly id: PropertyId;
  name: string;
  kind: PropertyKind;
  locationId: LocationId;
  /** Asking/assessed value in minor units of currencyId. */
  value: number;
  currencyId: CurrencyId;
  forSale: boolean;
  tags: string[];
  provenance: Provenance;
}

export interface OwnershipTransfer {
  readonly at: number;
  readonly from?: OwnerRef;
  readonly to: OwnerRef;
  readonly reason: string;
}

export interface OwnershipRecord {
  readonly asset: AssetRef;
  owner: OwnerRef;
  since: number;
  provenance: Provenance;
  history: OwnershipTransfer[];
}

/**
 * Risk without war. A profile describes what can happen (weighted outcomes)
 * and is resolved with the seeded Rng.
 */
export interface RiskOutcome {
  readonly key: string;
  readonly label: string;
  readonly weight: number;
  /** Multiplier on the value at stake: 0 = total loss, 1 = break-even, 1.2 = +20%. */
  readonly valueMultiplier: number;
}

export interface RiskProfile {
  readonly id: RiskProfileId;
  name: string;
  /** 'market', 'shipment', 'contract', 'investment', 'travel', ... */
  category: string;
  outcomes: RiskOutcome[];
}
