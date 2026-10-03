import { describe, expect, it } from 'vitest';
import { content } from '../src/config/content';
import { ManualClock, SequentialIdFactory, asId } from '../src/core';
import { bootstrapWorld, joinRealm } from '../src/seed';
import { mergePacks, parseContentPack, validatePack, type ContentPack } from '../src/world';

const RULES = () => content.rulesFor('server_happy-fall-blackmere');
const testPlace = (): ContentPack =>
  mergePacks('t', [
    content.pack('realm_happy-fall'),
    { ...emptyPack(), locations: [{ id: 'location_test-green', name: 'Test Green', kind: 'district', tags: [] }] },
  ]);
function emptyPack(): ContentPack {
  return { id: 'extra', realmId: 'realm_happy-fall', currencies: [], items: [], resources: [], locations: [], routes: [], actors: [], organizations: [], roles: [], markets: [], resourceNodes: [], properties: [], risks: [], contracts: [], searchSpots: [], happenings: [], familiarSpecies: [], familiars: [] };
}

describe('Happy Fall content', () => {
  it('has Chromatic Mythic 2.5D art direction metadata', () => {
    const art = content.realm('realm_happy-fall').presentation!.artDirection as Record<string, any>;
    expect(art.name).toBe('CHROMATIC MYTHIC 2.5D');
    expect(art.characteristics).toEqual(expect.arrayContaining(['strong silhouettes', '3D world logic underneath', 'render-efficient design']));
    expect(art.ip).toMatch(/original/i);
  });

  it('economy pack defines the Mark and items within the medieval / early-fantasy ceiling', () => {
    const pack = content.pack('realm_happy-fall');
    expect(pack.currencies.map((c) => c.id)).toContain('currency_mark');
    expect(pack.items.length).toBeGreaterThan(5);
    expect(validatePack(pack, content.realm('realm_happy-fall')).ok).toBe(true);
  });
});

describe('content pack validation', () => {
  it('catches broken references, duplicates and items above the ceiling', () => {
    const pack = mergePacks('bad', [
      content.pack('realm_happy-fall'),
      {
        ...emptyPack(),
        items: [{ id: 'item_musket', name: 'Musket', category: 'tool', tags: [], baseValue: 50, stackable: true, techTier: 'renaissance' }],
        actors: [{ id: 'actor_ghost', kind: 'npc', name: 'Ghost', locationId: 'location_nowhere', tags: [], purse: 0, inventory: { item_unobtainium: 1 } }],
        currencies: [{ id: 'currency_mark', name: 'Dup', symbol: 'd', minorPerMajor: 1 }],
      },
    ]);
    const r = validatePack(pack, content.realm('realm_happy-fall'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain('item_musket exceeds the technology ceiling');
      expect(r.error.message).toContain('actor_ghost is at unknown location');
      expect(r.error.message).toContain('unknown item item_unobtainium');
      expect(r.error.message).toContain('duplicate id currency_mark');
    }
  });

  it('reports structural errors with paths', () => {
    const r = parseContentPack({ id: 'x', realmId: 'r', routes: [{ id: 'route_a', from: 'a', to: 'b', travelTimeMs: -5 }] }, 'pack');
    expect(!r.ok && r.error.message).toContain('pack.routes[0].travelTimeMs');
  });
});

describe('bootstrap and joining a Realm', () => {
  it('seeds through services and gives a newcomer identity, purse and a first Chronicle entry', () => {
    const sim = (() => {
      const r = bootstrapWorld({ rules: RULES(), pack: testPlace(), modes: content.modes, seed: 3, clock: new ManualClock(5), ids: new SequentialIdFactory() });
      if (!r.ok) throw new Error(r.error.message);
      return r.value;
    })();
    expect(sim.state.items['item_hearth-loaf']!.originRealmId).toBe('realm_happy-fall');
    const joined = joinRealm(sim, { displayName: 'Wren', startAt: asId('location_test-green') });
    if (!joined.ok) throw new Error(joined.error.message);
    const { actor, personId } = joined.value;
    expect(sim.economy.balance({ kind: 'actor', id: actor.id }, 'currency_mark' as never)).toBe(40);
    expect(sim.state.persons[personId]!.actors['realm_happy-fall']).toBe(actor.id);
    expect(sim.identity.identitiesOf(personId).map((i) => i.context).sort()).toEqual(['REALM', 'UNIVERSAL']);
    expect(sim.chronicle.personal(actor.id).entries().map((e) => e.event)).toEqual(['location.discovered', 'realm.joined']);
    expect(joinRealm(sim, { displayName: 'Wren', startAt: asId('location_test-green'), personId }).ok).toBe(false);
  });
});
