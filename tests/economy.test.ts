import { describe, expect, it } from 'vitest';
import { ID, baker, makeSim, player } from './helpers/fixture';

describe('InventoryService', () => {
  it('adds, removes and rejects bad quantities and unknown items', () => {
    const { sim } = makeSim();
    expect(sim.inventory.add(player, ID.bread, 3).ok).toBe(true);
    expect(sim.inventory.count(player, ID.bread)).toBe(3);
    expect(sim.inventory.remove(player, ID.bread, 5).ok).toBe(false);
    expect(sim.inventory.add(player, ID.bread, 1.5).ok).toBe(false);
    expect(sim.inventory.add(player, ID.bread, -1).ok).toBe(false);
    expect(sim.inventory.add(player, 'item_nope' as never, 1).ok).toBe(false);
    expect(sim.inventory.remove(player, ID.bread, 3).ok).toBe(true);
    expect(sim.inventory.of(player).stacks).toEqual({});
  });

  it('moves atomically and respects capacity', () => {
    const { sim } = makeSim();
    sim.inventory.of(player).capacity = 2;
    const r = sim.inventory.move(baker, player, ID.bread, 3);
    expect(r.ok).toBe(false);
    expect(sim.inventory.count(baker, ID.bread)).toBe(20);
    expect(sim.inventory.count(player, ID.bread)).toBe(0);
  });
});

describe('EconomyService', () => {
  it('transfers with a ledger entry and conserves supply', () => {
    const { sim } = makeSim();
    const supply = sim.economy.supply(ID.coin);
    const r = sim.economy.transfer(player, baker, ID.coin, 30, { reason: 'test' });
    expect(r.ok).toBe(true);
    expect(sim.economy.balance(player, ID.coin)).toBe(70);
    expect(sim.economy.balance(baker, ID.coin)).toBe(230);
    expect(sim.economy.supply(ID.coin)).toBe(supply);
    expect(sim.state.ledger.at(-1)).toMatchObject({ amount: 30, reason: 'test' });
  });

  it('rejects overdrafts, fractional and non-positive amounts', () => {
    const { sim } = makeSim();
    expect(sim.economy.transfer(player, baker, ID.coin, 1000, { reason: 'x' }).ok).toBe(false);
    expect(sim.economy.transfer(player, baker, ID.coin, 0.5, { reason: 'x' }).ok).toBe(false);
    expect(sim.economy.transfer(player, baker, ID.coin, 0, { reason: 'x' }).ok).toBe(false);
    expect(sim.economy.transfer(player, player, ID.coin, 1, { reason: 'x' }).ok).toBe(false);
    expect(sim.economy.balance(player, ID.coin)).toBe(100);
  });

  it('mint and burn change supply and are ledgered', () => {
    const { sim } = makeSim();
    const before = sim.economy.supply(ID.coin);
    sim.economy.mint(player, ID.coin, 5, { reason: 'wage' });
    sim.economy.burn(player, ID.coin, 2, { reason: 'toll' });
    expect(sim.economy.supply(ID.coin)).toBe(before + 3);
    expect(sim.state.ledger.slice(-2).map((l) => l.reason)).toEqual(['wage', 'toll']);
  });
});

describe('MarketService', () => {
  it('buys from the vendor: money to vendor, goods to buyer', () => {
    const { sim } = makeSim();
    const r = sim.market.buy(player, ID.market, ID.bread, 4);
    expect(r.ok && r.value.total).toBe(20);
    expect(sim.economy.balance(player, ID.coin)).toBe(80);
    expect(sim.economy.balance(baker, ID.coin)).toBe(220);
    expect(sim.inventory.count(player, ID.bread)).toBe(4);
    expect(sim.inventory.count(baker, ID.bread)).toBe(16);
  });

  it('sells back at a spread', () => {
    const { sim } = makeSim();
    sim.market.buy(player, ID.market, ID.bread, 2);
    const r = sim.market.sell(player, ID.market, ID.bread, 2);
    expect(r.ok && r.value.unitPrice).toBe(3);
  });

  it('fails cleanly when out of stock or funds, changing nothing', () => {
    const { sim } = makeSim();
    expect(sim.market.buy(player, ID.market, ID.bread, 50).ok).toBe(false);
    sim.economy.burn(player, ID.coin, 98, { reason: 'drain' });
    expect(sim.market.buy(player, ID.market, ID.bread, 1).ok).toBe(false);
    expect(sim.inventory.count(baker, ID.bread)).toBe(20);
    expect(sim.economy.balance(player, ID.coin)).toBe(2);
  });

  it('price index changes prices within bounds and is chronicled', () => {
    const { sim } = makeSim();
    sim.market.setPriceIndex(ID.market, 1.4, 'poor harvest');
    expect(sim.market.quote(ID.market, ID.bread, 1, 'buy')).toMatchObject({ ok: true, value: { unitPrice: 7 } });
    sim.market.setPriceIndex(ID.market, 0.0001, 'crash');
    expect(sim.market.get(ID.market)!.priceIndex).toBe(0.2);
    expect(sim.chronicle.realm().entries().filter((e) => e.event === 'market.price-changed')).toHaveLength(2);
  });

  it('records a purchase in the buyer’s personal Chronicle', () => {
    const { sim } = makeSim();
    sim.market.buy(player, ID.market, ID.bread, 1);
    const entry = sim.chronicle.personal(player.id).entries().find((e) => e.event === 'market.purchase');
    expect(entry).toBeDefined();
    expect(entry!.participants).toContain(baker.id);
  });
});

describe('RiskService', () => {
  it('is deterministic for a given seed', () => {
    const a = makeSim(42).sim;
    const b = makeSim(42).sim;
    const ra = [1, 2, 3, 4, 5].map(() => a.risk.resolve(ID.venture, 100));
    const rb = [1, 2, 3, 4, 5].map(() => b.risk.resolve(ID.venture, 100));
    expect(ra).toEqual(rb);
  });

  it('reports expected multiplier', () => {
    const { sim } = makeSim();
    expect(sim.risk.expectedMultiplier(ID.venture)).toBeCloseTo(1.125);
  });
});
