import { isPositiveInt } from '../core/math';
import { err, ok, type Result } from '../core/result';
import type { ItemId, MarketId, OwnerRef } from '../core/refs';
import { emit, type SimContext } from '../world/context';
import type { EconomyService } from './economy';
import type { InventoryService } from './inventory';
import type { Market } from './types';

export type TradeSide = 'buy' | 'sell';

export interface Trade {
  marketId: MarketId;
  itemId: ItemId;
  quantity: number;
  unitPrice: number;
  total: number;
  side: TradeSide;
}

/**
 * Market = price table over a vendor. Buying moves money through the
 * EconomyService and goods through the InventoryService; the market itself
 * only knows prices.
 */
export class MarketService {
  constructor(
    private readonly ctx: SimContext,
    private readonly economy: EconomyService,
    private readonly inventory: InventoryService,
  ) {}

  get(id: MarketId): Market | undefined {
    return this.ctx.state.markets[id];
  }

  /** Unit price for the player's side of the trade. Integer, never below 1. */
  unitPrice(market: Market, itemId: ItemId, side: TradeSide): number | undefined {
    const listing = market.listings[itemId];
    if (!listing) return undefined;
    const buyPrice = Math.max(1, Math.round(listing.basePrice * market.priceIndex));
    if (side === 'buy') return buyPrice;
    return Math.max(1, Math.floor(buyPrice * (1 - listing.sellSpread)));
  }

  quote(marketId: MarketId, itemId: ItemId, quantity: number, side: TradeSide): Result<Trade> {
    const market = this.get(marketId);
    if (!market) return err('UNKNOWN_MARKET', `no market ${marketId}`);
    if (!isPositiveInt(quantity)) return err('BAD_QUANTITY', 'quantity must be a positive integer');
    const listing = market.listings[itemId];
    if (!listing) return err('NOT_LISTED', `${itemId} is not traded here`);
    if (side === 'buy' && !listing.buyable) return err('NOT_FOR_SALE', `${itemId} is not for sale`);
    if (side === 'sell' && !listing.sellable) return err('NOT_BOUGHT', `the vendor does not buy ${itemId}`);
    const unitPrice = this.unitPrice(market, itemId, side)!;
    return ok({ marketId, itemId, quantity, unitPrice, total: unitPrice * quantity, side });
  }

  /** Player buys from the vendor. Checks everything before changing anything. */
  buy(buyer: OwnerRef, marketId: MarketId, itemId: ItemId, quantity: number): Result<Trade> {
    const q = this.quote(marketId, itemId, quantity, 'buy');
    if (!q.ok) return q;
    const market = this.get(marketId)!;
    if (!this.inventory.has(market.vendor, itemId, quantity)) return err('OUT_OF_STOCK', 'the vendor does not have enough');
    if (!this.economy.canAfford(buyer, market.currencyId, q.value.total)) return err('INSUFFICIENT_FUNDS', 'not enough money');
    const room = this.inventory.canAdd(buyer, itemId, quantity);
    if (!room.ok) return room;

    this.economy.transfer(buyer, market.vendor, market.currencyId, q.value.total, { reason: `buy ${itemId}`, sourceSystem: 'market', ref: marketId });
    this.inventory.move(market.vendor, buyer, itemId, quantity, 'market purchase');
    this.announce(buyer, market, q.value);
    return q;
  }

  /** Player sells to the vendor. */
  sell(seller: OwnerRef, marketId: MarketId, itemId: ItemId, quantity: number): Result<Trade> {
    const q = this.quote(marketId, itemId, quantity, 'sell');
    if (!q.ok) return q;
    const market = this.get(marketId)!;
    if (!this.inventory.has(seller, itemId, quantity)) return err('INSUFFICIENT_ITEMS', `not enough ${itemId}`);
    if (!this.economy.canAfford(market.vendor, market.currencyId, q.value.total)) return err('VENDOR_FUNDS', 'the vendor cannot afford it');
    const room = this.inventory.canAdd(market.vendor, itemId, quantity);
    if (!room.ok) return room;

    this.economy.transfer(market.vendor, seller, market.currencyId, q.value.total, { reason: `sell ${itemId}`, sourceSystem: 'market', ref: marketId });
    this.inventory.move(seller, market.vendor, itemId, quantity, 'market sale');
    this.announce(seller, market, q.value);
    return q;
  }

  /** Market conditions shift prices. Bounded so a single event cannot zero a market. */
  setPriceIndex(marketId: MarketId, priceIndex: number, reason: string): Result<number> {
    const market = this.get(marketId);
    if (!market) return err('UNKNOWN_MARKET', `no market ${marketId}`);
    if (!(priceIndex > 0) || !Number.isFinite(priceIndex)) return err('BAD_INDEX', 'price index must be positive');
    const previous = market.priceIndex;
    market.priceIndex = Math.min(5, Math.max(0.2, priceIndex));
    emit(this.ctx, 'market.price-changed', { marketId, previous, priceIndex: market.priceIndex, reason }, {
      sourceSystem: 'market',
      location: market.locationId,
      outcome: market.priceIndex > previous ? 'prices-up' : 'prices-down',
      summary: `Prices at ${market.name} moved (${reason})`,
      visibility: 'realm',
      chronicle: true,
    });
    return ok(market.priceIndex);
  }

  private announce(trader: OwnerRef, market: Market, trade: Trade): void {
    const vendorActor = market.vendor.kind === 'actor' ? [market.vendor.id] : [];
    emit(this.ctx, trade.side === 'buy' ? 'market.purchase' : 'market.sale', { ...trade }, {
      sourceSystem: 'market',
      actor: trader.kind === 'actor' ? trader.id : undefined,
      location: market.locationId,
      participants: vendorActor,
      outcome: 'completed',
      summary: `${trade.side === 'buy' ? 'Bought' : 'Sold'} ${trade.quantity} × ${this.ctx.state.items[trade.itemId]?.name ?? trade.itemId} for ${trade.total}`,
      chronicle: true,
    });
  }
}
