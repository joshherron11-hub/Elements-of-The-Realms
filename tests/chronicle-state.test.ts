import { describe, expect, it } from 'vitest';
import { ManualClock, SequentialIdFactory, provenance } from '../src/core';
import { Simulation } from '../src/simulation';
import type { WorldState } from '../src/world';
import { ID, makeSim, player } from './helpers/fixture';

describe('ChronicleService', () => {
  it('records only chronicle-flagged events, with full context', () => {
    const { sim } = makeSim();
    const before = sim.state.chronicle.length;
    sim.inventory.add(player, ID.bread, 1); // not meaningful on its own
    expect(sim.state.chronicle.length).toBe(before);
    sim.world.travel(ID.player, ID.farm);
    const e = sim.state.chronicle.at(-1)!;
    expect(e).toMatchObject({
      event: 'location.discovered',
      actor: ID.player,
      location: ID.farm,
      context: { realmId: ID.realm, serverId: ID.server, domain: 'PLAY' },
      sourceSystem: 'world',
      visibility: 'private',
    });
    expect(e.provenance.sourceSystem).toBe('world');
  });

  it('is append-only: corrections cite the original', () => {
    const { sim } = makeSim();
    const original = sim.chronicle.record({ event: 'note', actor: ID.player, sourceSystem: 'test', summary: 'wrong' });
    const fix = sim.chronicle.correct(original.id, { event: 'note', actor: ID.player, sourceSystem: 'test', summary: 'right' })!;
    expect(fix.corrects).toBe(original.id);
    expect(sim.state.chronicle.find((e) => e.id === original.id)!.summary).toBe('wrong');
    expect(sim.chronicle.correct('chron_missing' as never, { event: 'x', sourceSystem: 't' })).toBeUndefined();
  });

  it('derived provenance must cite its sources', () => {
    expect(() => provenance('derived', 'x', 0)).toThrow();
    expect(provenance('derived', 'x', 0, { derivedFrom: ['a'] }).derivedFrom).toEqual(['a']);
  });
});

describe('WorldState serialisation', () => {
  it('round-trips through JSON and continues identically (incl. RNG)', () => {
    const { sim, clock } = makeSim(99);
    sim.market.buy(player, ID.market, ID.bread, 2);
    sim.world.travel(ID.player, ID.farm);

    const json = JSON.stringify(sim.state);
    const restored = JSON.parse(json) as WorldState;
    expect(restored).toEqual(JSON.parse(json));

    const copy = new Simulation({ state: restored, clock: new ManualClock(clock.now()), ids: new SequentialIdFactory(1000) }).start();
    expect(copy.economy.balance(player, ID.coin)).toBe(sim.economy.balance(player, ID.coin));
    expect(copy.inventory.count(player, ID.bread)).toBe(2);
    expect(copy.state.actors[ID.player]!.locationId).toBe(ID.farm);

    const next = [1, 2, 3].map(() => sim.risk.resolve(ID.venture, 10).ok && sim.ctx.rng.next());
    const nextCopy = [1, 2, 3].map(() => copy.risk.resolve(ID.venture, 10).ok && copy.ctx.rng.next());
    expect(nextCopy).toEqual(next);
  });

  it('kernel tick regenerates resources deterministically', () => {
    const { sim, state } = makeSim();
    state.resources['resource_wheat'] = { id: 'resource_wheat' as never, name: 'Wheat', yieldsItemId: ID.bread };
    state.resourceNodes['rnode_field'] = { id: 'rnode_field' as never, resourceId: 'resource_wheat' as never, locationId: ID.farm, amount: 2, capacity: 10, regenPerHour: 4 };
    expect(sim.resources.gather(player, 'rnode_field' as never, 5)).toMatchObject({ ok: true, value: 2 });
    expect(sim.resources.gather(player, 'rnode_field' as never, 1).ok).toBe(false);
    sim.tick(60 * 60 * 1000);
    expect(state.resourceNodes['rnode_field']!.amount).toBe(4);
  });
});
