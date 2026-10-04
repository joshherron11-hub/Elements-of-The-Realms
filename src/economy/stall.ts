import { err, ok, type Result } from '../core/result';
import { sameRef, type CurrencyId, type ItemId, type OwnerRef, type PropertyId } from '../core/refs';
import { emit, type SimContext } from '../world/context';
import { gameTime, inHours } from '../world/living';
import type { StallState } from '../world/world-state';
import type { EconomyService } from './economy';
import type { InventoryService } from './inventory';
import type { OwnershipService } from './ownership';

/**
 * A player's market stall — an ownership use for a 'stall' property.
 *
 * The owner lists goods they carry at a price. Each open in-game hour, for
 * each listing, passing townsfolk may buy one: the chance falls as the price
 * rises above the reference price and is zero beyond `maxPriceMultiple`.
 * Rolls use the seeded world RNG, so a given world always sells the same way.
 * Customers are off-screen townsfolk: their coin enters the economy as a
 * ledgered mint ('stall sale').
 */
export class StallService {
  constructor(
    private readonly ctx: SimContext,
    private readonly deps: { ownership: OwnershipService; economy: EconomyService; inventory: InventoryService },
  ) {}

  get(propertyId: string): StallState | undefined {
    return this.ctx.state.stalls[propertyId];
  }

  /** Reference price of an item: the lowest listing at any market, else its base value. */
  referencePrice(itemId: string): number {
    const prices = Object.values(this.ctx.state.markets)
      .map((m) => m.listings[itemId]?.basePrice)
      .filter((p): p is number => typeof p === 'number');
    return Math.max(1, prices.length ? Math.min(...prices) : this.ctx.state.items[itemId]?.baseValue ?? 1);
  }

  /** Chance per open hour that one unit sells at this price. */
  saleChance(itemId: string, price: number): number {
    const { baseChancePerHour: base, maxPriceMultiple: max } = this.ctx.living.stall;
    const ratio = price / this.referencePrice(itemId);
    if (ratio >= max) return 0;
    if (ratio <= 1) return Math.min(0.95, base * (1 + (1 - ratio) * 0.5));
    return base * ((max - ratio) / (max - 1));
  }

  private hourIndex(): number {
    return Math.floor(gameTime(this.ctx.state, this.ctx.clock.now(), this.ctx.living.calendar).totalHours);
  }

  /** List an item at a price, or remove it with price = null. Owner only; must hold the item to list it. */
  setListing(owner: OwnerRef, propertyId: PropertyId, itemId: ItemId, price: number | null): Result<StallState> {
    const property = this.ctx.state.properties[propertyId];
    if (!property || property.kind !== 'stall') return err('NOT_A_STALL', 'that is not a market stall');
    const holder = this.deps.ownership.ownerOf({ kind: 'property', id: propertyId });
    if (!holder || !sameRef(holder, owner)) return err('NOT_OWNER', `${property.name} is not yours`);
    if (!this.ctx.state.items[itemId]) return err('UNKNOWN_ITEM', `no item ${itemId}`);
    let stall = this.ctx.state.stalls[propertyId];
    const opening = !stall;
    if (price === null) {
      if (stall) delete stall.listings[itemId];
      return stall ? ok(stall) : err('NOT_LISTED', 'nothing is listed');
    }
    if (!Number.isSafeInteger(price) || price < 1) return err('BAD_PRICE', 'price must be a whole number of at least 1');
    const max = Math.floor(this.referencePrice(itemId) * this.ctx.living.stall.maxPriceMultiple);
    if (price > max) return err('PRICE_TOO_HIGH', `nobody would pay that — at most ${max}`);
    if (!this.deps.inventory.has(owner, itemId, 1)) return err('NO_STOCK', `you have no ${this.ctx.state.items[itemId]!.name} to sell`);
    stall ??= this.ctx.state.stalls[propertyId] = { propertyId, listings: {}, processedHour: this.hourIndex(), earnings: 0, sales: 0 };
    stall.listings[itemId] = { price };
    if (opening) {
      emit(this.ctx, 'stall.opened', { propertyId }, {
        sourceSystem: 'stall',
        actor: owner.kind === 'actor' ? owner.id : undefined,
        location: property.locationId,
        outcome: 'opened',
        summary: `Opened ${property.name} for trade`,
        chronicle: true,
      });
    }
    return ok(stall);
  }

  /** Simulate customer traffic for every in-game hour since the last tick. */
  tick(): void {
    const now = this.hourIndex();
    const rules = this.ctx.living.stall;
    for (const stall of Object.values(this.ctx.state.stalls)) {
      const owner = this.deps.ownership.ownerOf({ kind: 'property', id: stall.propertyId });
      const property = this.ctx.state.properties[stall.propertyId];
      if (!owner || !property) continue;
      const start = Math.max(stall.processedHour + 1, now - rules.maxCatchUpHours + 1);
      for (let h = start; h <= now; h++) {
        if (!inHours(((h % 24) + 24) % 24, rules.openHour, rules.closeHour)) continue;
        for (const itemId of Object.keys(stall.listings).sort()) {
          const { price } = stall.listings[itemId]!;
          if (!this.deps.inventory.has(owner, itemId as ItemId, 1)) continue;
          if (this.ctx.rng.next() >= this.saleChance(itemId, price)) continue;
          this.deps.inventory.remove(owner, itemId as ItemId, 1, 'stall sale');
          this.deps.economy.mint(owner, property.currencyId as CurrencyId, price, { reason: 'stall sale', sourceSystem: 'stall', ref: stall.propertyId });
          stall.earnings += price;
          stall.sales += 1;
          emit(this.ctx, 'stall.sale', { propertyId: stall.propertyId, itemId, price }, {
            sourceSystem: 'stall',
            actor: owner.kind === 'actor' ? owner.id : undefined,
            location: property.locationId,
            outcome: 'sold',
            summary: `Your stall sold ${this.ctx.state.items[itemId]?.name ?? itemId} for ${price}`,
            chronicle: true,
          });
        }
      }
      stall.processedHour = Math.max(stall.processedHour, now);
    }
  }
}
