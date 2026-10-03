import { describe, expect, it } from 'vitest';
import { content } from '../src/config/content';
import { ManualClock, SequentialIdFactory, asId } from '../src/core';
import { parseSceneLayout, type SceneLayout } from '../src/render/layout';
import { bootstrapWorld, joinRealm } from '../src/seed';
import { isBlocked, moveWithCollision, zoneAt } from '../src/ui/navigation';
import { loadSceneLayouts } from '../src/ui/scenes';

const layouts = loadSceneLayouts();
const pack = content.pack('realm_happy-fall');
const loc = (id: string) => pack.locations.find((l) => l.id === id);

function world() {
  const rules = content.rulesFor('server_happy-fall-blackmere');
  const r = bootstrapWorld({ rules, pack, modes: content.modes, seed: 1, clock: new ManualClock(0), ids: new SequentialIdFactory() });
  if (!r.ok) throw new Error(r.error.message);
  const sim = r.value;
  const j = joinRealm(sim, { displayName: 'Wren', startAt: asId('location_blackmere-square') });
  if (!j.ok) throw new Error(j.error.message);
  return { sim, me: j.value.actor.id };
}

describe('Blackmere content', () => {
  it('has every required area', () => {
    const names = pack.locations.map((l) => l.name);
    for (const n of ['Blackmere Town Square', 'The Lantern & Ladle', 'Blackmere Market', 'Hearth Row', 'The East Road', 'Brindle Farm Edge', 'Hollowmere Woodland Edge', 'Blackmere Keep — Gatehouse']) {
      expect(names).toContain(n);
    }
  });

  it('has the six initial NPCs with original names and authored dialogue', () => {
    const roles = ['innkeeper', 'merchant', 'farmer', 'courier', 'official', 'traveler'];
    for (const role of roles) {
      const npc = pack.actors.find((a) => a.tags.includes(role));
      expect(npc, role).toBeDefined();
      expect(npc!.profile?.greeting, role).toBeTruthy();
    }
  });

  it('every area is reachable from the Town Square', () => {
    const { sim } = world();
    for (const l of pack.locations.filter((x) => x.sceneKey)) {
      expect(sim.world.findPath(asId('location_blackmere-square'), asId(l.id)), l.id).toBeDefined();
    }
  });
});

describe('scene layouts', () => {
  it('parse, and reject malformed layouts with paths', () => {
    expect(layouts.size).toBe(3);
    const r = parseSceneLayout({ id: 'x', name: 'x', size: [10, 10], ground: 'ground', zones: [{ locationId: 'l', rect: [5, 0, 1, 1] }], playerStart: [0, 0], props: [{ type: 'spaceship', at: [0, 0] }] }, 'bad');
    expect(!r.ok && r.error.message).toContain('bad.zones[0].rect');
    expect(!r.ok && r.error.message).toContain('bad.props[0].type');
  });

  it('every scene-bound location has a zone and spawn in its scene, and nowhere else', () => {
    for (const l of pack.locations.filter((x) => x.sceneKey)) {
      const layout = layouts.get(l.sceneKey!);
      expect(layout, l.id).toBeDefined();
      expect(layout!.zones.some((z) => z.locationId === l.id), l.id).toBe(true);
      const spawn = layout!.spawns[l.id];
      expect(spawn, l.id).toBeDefined();
      expect(zoneAt(layout!, spawn!), `${l.id} spawn zone`).toBe(l.id);
      expect(isBlocked(layout!, spawn!), `${l.id} spawn blocked`).toBe(false);
    }
    for (const layout of layouts.values()) for (const z of layout.zones) expect(loc(z.locationId)?.sceneKey).toBe(layout.id);
  });

  it('every NPC is placed in the scene of its location, on open ground', () => {
    for (const a of pack.actors) {
      const scene = loc(a.locationId!)!.sceneKey!;
      const at = layouts.get(scene)!.npcs[a.id];
      expect(at, a.id).toBeDefined();
      expect(isBlocked(layouts.get(scene)!, at!), a.id).toBe(false);
    }
  });

  it('exits connect real scenes along real routes, and arrival points do not re-trigger exits', () => {
    const { sim } = world();
    for (const layout of layouts.values()) {
      for (const e of layout.exits) {
        const target = layouts.get(e.to.scene);
        expect(target, e.id).toBeDefined();
        expect(zoneAt(target!, e.to.at), `${e.id} arrival zone`).toBe(e.to.locationId);
        expect(isBlocked(target!, e.to.at), `${e.id} arrival blocked`).toBe(false);
        for (const back of target!.exits) expect(Math.hypot(back.at[0] - e.to.at[0], back.at[1] - e.to.at[1]) > back.radius, `${e.id} → ${back.id}`).toBe(true);
        const from = zoneAt(layout, e.at) ?? layout.zones[0]!.locationId;
        expect(sim.world.findPath(asId(from), asId(e.to.locationId)), e.id).toBeDefined();
      }
    }
  });

  it('collision keeps the player out of buildings but lets them slide along walls', () => {
    const town = layouts.get('blackmere-town') as SceneLayout;
    const inside = moveWithCollision(town, [0, 4], [0, -5]); // the well is at the origin
    expect(isBlocked(town, inside)).toBe(false);
    expect(inside[1]).toBeGreaterThan(1.5);
    const slid = moveWithCollision(town, [0, 4], [1, -5]);
    expect(slid[0]).toBe(1);
  });
});

describe('walking through Blackmere drives simulation travel', () => {
  it('crossing zones produces travel intents that move the actor and discover places', () => {
    const { sim, me } = world();
    const town = layouts.get('blackmere-town')!;
    for (const p of [[19, 0], [0, 3], [-20, 2], [0, 3], [0, -20]] as [number, number][]) {
      const r = sim.modes.perform(me, { kind: 'travel', to: asId(zoneAt(town, p)!) });
      expect(r.ok).toBe(true);
    }
    expect(sim.state.actors[me]!.locationId).toBe('location_blackmere-keep');
    expect(sim.state.discoveries[me]).toEqual(expect.arrayContaining(['location_blackmere-market', 'location_blackmere-hearth-row', 'location_blackmere-keep']));
  });

  it('talking to the innkeeper returns her authored greeting', () => {
    const { sim, me } = world();
    sim.modes.perform(me, { kind: 'travel', to: asId('location_blackmere-tavern') });
    const r = sim.modes.perform(me, { kind: 'talk', with: asId('actor_maren-holloway') });
    expect(r.ok && r.value.data!.greeting).toMatch(/Come in out of the wind/);
  });

  it('buys at Quill’s Sundries and gathers apples at Brindle Farm', () => {
    const { sim, me } = world();
    const self = { kind: 'actor' as const, id: me };
    sim.modes.perform(me, { kind: 'travel', to: asId('location_blackmere-market') });
    const buy = sim.modes.perform(me, { kind: 'buy', marketId: asId('market_quills-sundries'), itemId: asId('item_hound-biscuits'), quantity: 1 });
    expect(buy.ok).toBe(true);
    expect(sim.economy.balance(self, asId('currency_mark'))).toBe(38);
    sim.modes.perform(me, { kind: 'travel', to: asId('location_brindle-farm') });
    expect(sim.modes.perform(me, { kind: 'gather', nodeId: asId('rnode_brindle-orchard'), amount: 1 }).ok).toBe(true);
    expect(sim.inventory.count(self, asId('item_russet-apples'))).toBe(1);
  });
});
