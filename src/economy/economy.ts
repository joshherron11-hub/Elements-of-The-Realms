import { isPositiveInt } from '../core/math';
import { err, ok, type Result } from '../core/result';
import { refKey, type CurrencyId, type OwnerRef } from '../core/refs';
import { emit, type SimContext } from '../world/context';
import type { LedgerEntry, Wallet } from './types';

export interface TransferOptions {
  reason: string;
  sourceSystem?: string;
  ref?: string;
}

/**
 * Currency balances and the ledger. Every movement of money in the kernel
 * goes through here, so the ledger is complete and conservation holds:
 * money only enters via mint() and leaves via burn().
 */
export class EconomyService {
  constructor(private readonly ctx: SimContext) {}

  wallet(holder: OwnerRef): Wallet {
    const key = refKey(holder);
    let w = this.ctx.state.wallets[key];
    if (!w) {
      w = { holder, balances: {} };
      this.ctx.state.wallets[key] = w;
    }
    return w;
  }

  balance(holder: OwnerRef, currencyId: CurrencyId): number {
    return this.ctx.state.wallets[refKey(holder)]?.balances[currencyId] ?? 0;
  }

  canAfford(holder: OwnerRef, currencyId: CurrencyId, amount: number): boolean {
    return this.balance(holder, currencyId) >= amount;
  }

  private validate(currencyId: CurrencyId, amount: number): Result<true> {
    if (!this.ctx.state.currencies[currencyId]) return err('UNKNOWN_CURRENCY', `no currency ${currencyId}`);
    if (!isPositiveInt(amount)) return err('BAD_AMOUNT', `amount must be a positive integer, got ${amount}`);
    return ok(true);
  }

  private record(entry: Omit<LedgerEntry, 'id' | 'at'>): LedgerEntry {
    const full: LedgerEntry = { id: this.ctx.ids.next('ledger'), at: this.ctx.clock.now(), ...entry };
    this.ctx.state.ledger.push(full);
    return full;
  }

  /** Money enters the economy (wages from the Realm, starting purse, rewards from the world). */
  mint(to: OwnerRef, currencyId: CurrencyId, amount: number, opts: TransferOptions): Result<LedgerEntry> {
    const v = this.validate(currencyId, amount);
    if (!v.ok) return v;
    const w = this.wallet(to);
    w.balances[currencyId] = (w.balances[currencyId] ?? 0) + amount;
    const entry = this.record({ currencyId, amount, to, reason: opts.reason, sourceSystem: opts.sourceSystem ?? 'economy', ref: opts.ref });
    emit(this.ctx, 'economy.minted', { entry }, { sourceSystem: 'economy' });
    return ok(entry);
  }

  /** Money leaves the economy (fees, losses, sinks). */
  burn(from: OwnerRef, currencyId: CurrencyId, amount: number, opts: TransferOptions): Result<LedgerEntry> {
    const v = this.validate(currencyId, amount);
    if (!v.ok) return v;
    if (!this.canAfford(from, currencyId, amount)) return err('INSUFFICIENT_FUNDS', 'not enough money');
    const w = this.wallet(from);
    w.balances[currencyId] = w.balances[currencyId]! - amount;
    const entry = this.record({ currencyId, amount, from, reason: opts.reason, sourceSystem: opts.sourceSystem ?? 'economy', ref: opts.ref });
    emit(this.ctx, 'economy.burned', { entry }, { sourceSystem: 'economy' });
    return ok(entry);
  }

  transfer(from: OwnerRef, to: OwnerRef, currencyId: CurrencyId, amount: number, opts: TransferOptions): Result<LedgerEntry> {
    const v = this.validate(currencyId, amount);
    if (!v.ok) return v;
    if (refKey(from) === refKey(to)) return err('SAME_HOLDER', 'cannot transfer to self');
    if (!this.canAfford(from, currencyId, amount)) return err('INSUFFICIENT_FUNDS', 'not enough money');
    const src = this.wallet(from);
    const dst = this.wallet(to);
    src.balances[currencyId] = src.balances[currencyId]! - amount;
    dst.balances[currencyId] = (dst.balances[currencyId] ?? 0) + amount;
    const entry = this.record({ currencyId, amount, from, to, reason: opts.reason, sourceSystem: opts.sourceSystem ?? 'economy', ref: opts.ref });
    emit(this.ctx, 'economy.transferred', { entry }, { sourceSystem: 'economy' });
    return ok(entry);
  }

  /** Total money in existence for a currency. Used to check conservation. */
  supply(currencyId: CurrencyId): number {
    return Object.values(this.ctx.state.wallets).reduce((sum, w) => sum + (w.balances[currencyId] ?? 0), 0);
  }
}
