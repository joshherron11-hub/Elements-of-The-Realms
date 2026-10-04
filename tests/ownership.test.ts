import { describe, expect, it } from 'vitest';
import { provenance } from '../src/core';
import { baker, makeSim, player } from './helpers/fixture';

const asset = { kind: 'familiar' as const, id: 'familiar_1' };

describe('OwnershipService', () => {
  it('registers, transfers and keeps history', () => {
    const { sim, clock } = makeSim();
    expect(sim.ownership.register(asset, baker, provenance('authored', 'test', 0)).ok).toBe(true);
    expect(sim.ownership.register(asset, player, provenance('authored', 'test', 0)).ok).toBe(false);
    clock.advance(10);
    const t = sim.ownership.transfer(asset, baker, player, 'gift');
    expect(t.ok).toBe(true);
    expect(sim.ownership.isOwner(asset, player)).toBe(true);
    expect(sim.ownership.get(asset)!.history.map((h) => h.reason)).toEqual(['created', 'gift']);
    expect(sim.ownership.assetsOf(player, 'familiar')).toEqual([asset]);
  });

  it('refuses transfers from a non-owner', () => {
    const { sim } = makeSim();
    sim.ownership.register(asset, baker, provenance('authored', 'test', 0));
    const r = sim.ownership.transfer(asset, player, baker, 'theft');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_OWNER');
  });

  it('records ownership changes in the Chronicle', () => {
    const { sim } = makeSim();
    sim.ownership.register(asset, baker, provenance('authored', 'test', 0));
    sim.ownership.transfer(asset, baker, player, 'sale');
    expect(sim.chronicle.personal(player.id).entries().some((e) => e.event === 'ownership.transferred')).toBe(true);
  });
});
