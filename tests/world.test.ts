import { describe, expect, it } from 'vitest';
import { asId } from '../src/core';
import { ID, makeSim } from './helpers/fixture';

describe('WorldService', () => {
  it('finds the shortest path by travel time', () => {
    const { sim } = makeSim();
    const p = sim.world.findPath(ID.square, ID.farm)!;
    expect(p.locations).toEqual([ID.square, ID.shop, ID.farm]);
    expect(p.travelTimeMs).toBe(60);
  });

  it('avoids closed routes and reports unreachable locations', () => {
    const { sim } = makeSim();
    sim.world.setRouteStatus(asId('route_shop_farm'), 'closed', 'flood');
    expect(sim.world.findPath(ID.square, ID.farm)!.travelTimeMs).toBe(100);
    expect(sim.world.findPath(ID.square, ID.island)).toBeUndefined();
    expect(sim.world.travel(ID.player, ID.island).ok).toBe(false);
  });

  it('travel moves the actor and discovers the destination once', () => {
    const { sim } = makeSim();
    expect(sim.world.travel(ID.player, ID.farm).ok).toBe(true);
    expect(sim.state.actors[ID.player]!.locationId).toBe(ID.farm);
    expect(sim.world.hasDiscovered(ID.player, ID.farm)).toBe(true);
    sim.world.travel(ID.player, ID.square);
    sim.world.travel(ID.player, ID.farm);
    const discoveries = sim.chronicle.personal(ID.player).entries().filter((e) => e.event === 'location.discovered');
    expect(discoveries.map((d) => d.location)).toEqual([ID.farm, ID.square]);
  });

  it('knows location nesting', () => {
    const { sim } = makeSim();
    expect(sim.world.isWithin(ID.shop, ID.town)).toBe(true);
    expect(sim.world.isWithin(ID.farm, ID.town)).toBe(false);
    expect(sim.world.children(ID.town).map((l) => l.id).sort()).toEqual([ID.shop, ID.square].sort());
  });
});
