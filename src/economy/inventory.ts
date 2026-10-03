import { isPositiveInt } from '../core/math';
import { err, ok, type Result } from '../core/result';
import { refKey, type ItemId, type OwnerRef } from '../core/refs';
import { emit, type SimContext } from '../world/context';
import type { Inventory } from './types';

/** Fungible item stacks held by any owner. All quantity math lives here. */
export class InventoryService {
  constructor(private readonly ctx: SimContext) {}

  /** Get (creating lazily) the inventory for an owner. */
  of(holder: OwnerRef): Inventory {
    const key = refKey(holder);
    let inv = this.ctx.state.inventories[key];
    if (!inv) {
      inv = { holder, stacks: {} };
      this.ctx.state.inventories[key] = inv;
    }
    return inv;
  }

  count(holder: OwnerRef, itemId: ItemId): number {
    return this.ctx.state.inventories[refKey(holder)]?.stacks[itemId] ?? 0;
  }

  total(holder: OwnerRef): number {
    const inv = this.ctx.state.inventories[refKey(holder)];
    return inv ? Object.values(inv.stacks).reduce((a, b) => a + b, 0) : 0;
  }

  has(holder: OwnerRef, itemId: ItemId, quantity: number): boolean {
    return this.count(holder, itemId) >= quantity;
  }

  canAdd(holder: OwnerRef, itemId: ItemId, quantity: number): Result<true> {
    if (!isPositiveInt(quantity)) return err('BAD_QUANTITY', `quantity must be a positive integer, got ${quantity}`);
    if (!this.ctx.state.items[itemId]) return err('UNKNOWN_ITEM', `no item definition ${itemId}`);
    const inv = this.of(holder);
    if (inv.capacity !== undefined && this.total(holder) + quantity > inv.capacity) {
      return err('INVENTORY_FULL', 'not enough inventory capacity');
    }
    return ok(true);
  }

  add(holder: OwnerRef, itemId: ItemId, quantity: number, reason = 'added'): Result<number> {
    const check = this.canAdd(holder, itemId, quantity);
    if (!check.ok) return check;
    const inv = this.of(holder);
    inv.stacks[itemId] = (inv.stacks[itemId] ?? 0) + quantity;
    emit(this.ctx, 'inventory.added', { holder, itemId, quantity, reason }, { sourceSystem: 'inventory' });
    return ok(inv.stacks[itemId]!);
  }

  remove(holder: OwnerRef, itemId: ItemId, quantity: number, reason = 'removed'): Result<number> {
    if (!isPositiveInt(quantity)) return err('BAD_QUANTITY', `quantity must be a positive integer, got ${quantity}`);
    if (!this.has(holder, itemId, quantity)) return err('INSUFFICIENT_ITEMS', `not enough ${itemId}`);
    const inv = this.of(holder);
    const left = inv.stacks[itemId]! - quantity;
    if (left === 0) delete inv.stacks[itemId];
    else inv.stacks[itemId] = left;
    emit(this.ctx, 'inventory.removed', { holder, itemId, quantity, reason }, { sourceSystem: 'inventory' });
    return ok(left);
  }

  /** Atomic move: either both sides change or neither does. */
  move(from: OwnerRef, to: OwnerRef, itemId: ItemId, quantity: number, reason = 'moved'): Result<true> {
    if (!this.has(from, itemId, quantity)) return err('INSUFFICIENT_ITEMS', `not enough ${itemId}`);
    const check = this.canAdd(to, itemId, quantity);
    if (!check.ok) return check;
    this.remove(from, itemId, quantity, reason);
    this.add(to, itemId, quantity, reason);
    return ok(true);
  }
}
