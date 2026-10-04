import { describe, expect, it } from 'vitest';
import { content } from '../src/config/content';
import { ManualClock, SequentialIdFactory, asId, type FamiliarId } from '../src/core';
import { BOND_COOLDOWN_MS, NEW_OWNER_BOND } from '../src/familiars';
import { findForbiddenKeys } from '../src/identity';
import type { Intent } from '../src/modes';
import { bootstrapWorld, joinRealm } from '../src/seed';
import { Simulation } from '../src/simulation';
import type { WorldState } from '../src/world';

const BRAMBLE = asId<'familiar'>('familiar_bramble') as FamiliarId;
const WICK = asId<'familiar'>('familiar_wick') as FamiliarId;
const CORVIN = asId<'familiar'>('familiar_old-corvin') as FamiliarId;
const BISCUITS = asId<'item'>('item_hound-biscuits');
const SEED_CAKE = asId<'item'>('item_seed-cake');
const L = (id: string) => asId<'location'>(`location_${id}`);
const HOUR = 3_600_000;

function world(seed = 1) {
  const clock = new ManualClock(1_000_000);
  const rules = content.rulesFor('server_happy-fall-blackmere');
  const r = bootstrapWorld({ rules, pack: content.pack(rules.realm.id), modes: content.modes, seed, clock, ids: new SequentialIdFactory() });
  if (!r.ok) throw new Error(r.error.message);
  const sim = r.value;
  const j = joinRealm(sim, { displayName: 'Wren', startAt: L('blackmere-square') });
  if (!j.ok) throw new Error(j.error.message);
  const me = j.value.actor.id;
  const self = { kind: 'actor' as const, id: me };
  const act = (i: Intent) => sim.modes.perform(me, i);
  const must = (i: Intent) => {
    const r = act(i);
    if (!r.ok) throw new Error(`${i.kind}: ${r.error.message}`);
    return r.value;
  };
  const go = (loc: string) => must({ kind: 'travel', to: L(loc) });
  return { sim, clock, me, self, act, must, go, rules };
}

/** A player who has adopted Bramble and holds some biscuits. */
function withBramble() {
  const w = world();
  w.go('blackmere-market');
  w.must({ kind: 'buy', marketId: asId('market_quills-sundries'), itemId: BISCUITS, quantity: 1 });
  w.must({ kind: 'buy', marketId: asId('market_quills-sundries'), itemId: BISCUITS, quantity: 1 });
  w.go('brindle-farm');
  w.must({ kind: 'acquire-familiar', familiarId: BRAMBLE });
  w.sim.modes.enter(w.me, 'COMPANION');
  return w;
}

describe('Familiar examples', () => {
  it('three distinct Familiars, including a dog-like companion for a peaceful player', () => {
    const { sim } = world();
    const fs = [BRAMBLE, WICK, CORVIN].map((id) => sim.familiars.get(id)!);
    const roles = fs.map((f) => sim.familiars.species(f)!.role);
    expect(roles).toEqual(['companion', 'collectible', 'symbol']);
    const bramble = fs[0]!;
    expect(sim.familiars.species(bramble)!.figure).toBe('hound');
    for (const f of fs) {
      expect(f).toMatchObject({ name: expect.any(String), variant: expect.any(String), temperament: expect.any(String), originRealmId: 'realm_happy-fall' });
      expect(f.provenance.origin).toBe('authored');
      expect(sim.familiars.formIn(f, 'realm_happy-fall')).toBeTruthy();
      expect(f.utilityTags.length).toBeGreaterThan(0);
    }
    expect(sim.familiars.ownerOf(CORVIN)).toEqual({ kind: 'organization', id: 'org_blackmere-council' });
  });
});

describe('Familiar ownership', () => {
  it('adopting Bramble pays Hester, moves ownership, resets the bond and is chronicled', () => {
    const w = world();
    const hester = { kind: 'actor' as const, id: asId<'actor'>('actor_hester-brindle') };
    const before = w.sim.economy.balance(hester, asId('currency_mark'));
    const away = w.act({ kind: 'acquire-familiar', familiarId: BRAMBLE });
    expect(!away.ok && away.error.code).toBe('NOT_PRESENT');
    w.go('brindle-farm');
    expect(w.sim.modes.available(w.me)).toContainEqual({ kind: 'acquire-familiar', familiarId: BRAMBLE });
    w.must({ kind: 'acquire-familiar', familiarId: BRAMBLE });
    expect(w.sim.familiars.ownerOf(BRAMBLE)).toEqual(w.self);
    expect(w.sim.economy.balance(hester, asId('currency_mark'))).toBe(before + 12);
    expect(w.sim.economy.balance(w.self, asId('currency_mark'))).toBe(28);
    const f = w.sim.familiars.get(BRAMBLE)!;
    expect(f.bond).toBe(NEW_OWNER_BOND);
    expect(f.offer).toBeUndefined();
    expect(w.sim.ownership.get({ kind: 'familiar', id: BRAMBLE })!.history.map((h) => h.reason)).toEqual(['born', 'purchase']);
    const entry = w.sim.chronicle.personal(w.me).entries().find((e) => e.event === 'familiar.acquired')!;
    expect(entry.summary).toMatch(/Bramble the russet hound/);
    expect(f.history).toContain(entry.id);
    expect(w.act({ kind: 'acquire-familiar', familiarId: BRAMBLE }).ok).toBe(false);
  });

  it('the Keep raven is a civic symbol and not for sale', () => {
    const w = world();
    w.go('blackmere-keep');
    const r = w.sim.familiars.acquire(w.self, CORVIN);
    expect(!r.ok && r.error.code).toBe('NOT_OFFERED');
  });

  it('only the owner can care for a Familiar', () => {
    const w = world();
    w.go('brindle-farm');
    const r = w.sim.familiars.feed(w.self, BRAMBLE, BISCUITS);
    expect(!r.ok && r.error.code).toBe('NOT_OWNER');
  });

  it('a following Familiar travels with its owner; the raven stays at the Keep', () => {
    const w = withBramble();
    w.go('blackmere-market');
    expect(w.sim.state.actors[w.sim.familiars.get(BRAMBLE)!.actorId]!.locationId).toBe('location_blackmere-market');
    expect(w.sim.state.actors[w.sim.familiars.get(CORVIN)!.actorId]!.locationId).toBe('location_blackmere-keep');
  });
});

describe('Familiar care state', () => {
  it('feeding uses the right food from the inventory and raises satiety', () => {
    const w = withBramble();
    w.sim.modes.enter(w.me, 'LIVE');
    w.go('blackmere-market');
    w.must({ kind: 'buy', marketId: asId('market_quills-sundries'), itemId: SEED_CAKE, quantity: 1 });
    w.sim.modes.enter(w.me, 'COMPANION');
    const wrong = w.act({ kind: 'feed-familiar', familiarId: BRAMBLE, itemId: SEED_CAKE });
    expect(!wrong.ok && wrong.error.code).toBe('WRONG_FOOD');
    w.must({ kind: 'feed-familiar', familiarId: BRAMBLE, itemId: BISCUITS });
    const f = w.sim.familiars.get(BRAMBLE)!;
    expect(f.care.satiety).toBe(85);
    expect(w.sim.inventory.count(w.self, BISCUITS)).toBe(1);
    w.must({ kind: 'feed-familiar', familiarId: BRAMBLE, itemId: BISCUITS }); // 85 < 95, still accepted
    expect(w.sim.familiars.get(BRAMBLE)!.care.satiety).toBe(100);
    w.sim.inventory.add(w.self, BISCUITS, 1);
    const over = w.act({ kind: 'feed-familiar', familiarId: BRAMBLE, itemId: BISCUITS });
    expect(!over.ok && over.error.code).toBe('NOT_HUNGRY');
  });

  it('care decays with time, deterministically; resting restores energy', () => {
    const a = withBramble();
    const b = withBramble();
    for (const w of [a, b]) {
      w.clock.advance(5 * HOUR);
      w.sim.tick(5 * HOUR);
    }
    const fa = a.sim.familiars.get(BRAMBLE)!;
    expect(fa.care).toEqual(b.sim.familiars.get(BRAMBLE)!.care);
    expect(fa.care.satiety).toBe(10); // 50 - 8/h × 5h
    expect(fa.care.energy).toBe(45); // 75 - 6/h × 5h
    a.must({ kind: 'rest-familiar', familiarId: BRAMBLE });
    expect(a.sim.familiars.get(BRAMBLE)!.care.energy).toBe(95);
    const status = a.must({ kind: 'familiar-status' });
    expect(status.summary).toMatch(/Bramble the russet hound: bond \d+, very hungry/);
  });
});

describe('bond changes', () => {
  it('time together builds the bond, with a cooldown; milestones are chronicled', () => {
    const w = withBramble();
    w.must({ kind: 'feed-familiar', familiarId: BRAMBLE, itemId: BISCUITS }); // hungry → +2
    expect(w.sim.familiars.get(BRAMBLE)!.bond).toBe(NEW_OWNER_BOND + 2);
    w.must({ kind: 'bond-familiar', familiarId: BRAMBLE });
    expect(w.sim.familiars.get(BRAMBLE)!.bond).toBe(13);
    const soon = w.act({ kind: 'bond-familiar', familiarId: BRAMBLE });
    expect(!soon.ok && soon.error.code).toBe('RECENTLY');
    for (let i = 0; i < 2; i++) {
      w.clock.advance(BOND_COOLDOWN_MS);
      w.must({ kind: 'rest-familiar', familiarId: BRAMBLE });
      w.must({ kind: 'bond-familiar', familiarId: BRAMBLE });
    }
    expect(w.sim.familiars.get(BRAMBLE)!.bond).toBe(25);
    const deepened = w.sim.chronicle.personal(w.me).entries().filter((e) => e.event === 'familiar.bond-deepened');
    expect(deepened).toHaveLength(1);
    expect(deepened[0]!.summary).toMatch(/growing fond/);
    expect(w.sim.familiars.get(BRAMBLE)!.history).toContain(deepened[0]!.id);
  });

  it('a starving Familiar will not play, and long neglect wears the bond', () => {
    const w = withBramble();
    w.clock.advance(20 * HOUR);
    w.sim.tick(20 * HOUR);
    const f = w.sim.familiars.get(BRAMBLE)!;
    expect(f.care.satiety).toBe(0);
    expect(f.bond).toBeLessThan(NEW_OWNER_BOND);
    const r = w.act({ kind: 'bond-familiar', familiarId: BRAMBLE });
    expect(!r.ok && ['TOO_HUNGRY', 'TOO_TIRED'].includes(r.error.code)).toBe(true);
  });

  it('care belongs to the Companion mode; Social mode cannot feed', () => {
    const w = withBramble();
    expect(w.sim.modes.available(w.me).map((i) => i.kind)).toEqual(expect.arrayContaining(['feed-familiar', 'rest-familiar', 'bond-familiar', 'familiar-status']));
    w.sim.modes.enter(w.me, 'SOCIAL');
    const r = w.act({ kind: 'feed-familiar', familiarId: BRAMBLE, itemId: BISCUITS });
    expect(!r.ok && r.error.code).toBe('NOT_IN_MODE');
  });
});

describe('Familiar save / load', () => {
  it('ownership, care, bond and history survive a JSON round trip and keep evolving identically', () => {
    const w = withBramble();
    w.must({ kind: 'feed-familiar', familiarId: BRAMBLE, itemId: BISCUITS });
    w.must({ kind: 'bond-familiar', familiarId: BRAMBLE });
    const saved = JSON.parse(JSON.stringify(w.sim.state)) as WorldState;
    const loaded = new Simulation({ state: saved, clock: new ManualClock(w.clock.now()), ids: new SequentialIdFactory(5000), rules: w.rules, modes: content.modes }).start();
    expect(loaded.familiars.ownerOf(BRAMBLE)).toEqual(w.self);
    expect(loaded.familiars.get(BRAMBLE)).toEqual(w.sim.familiars.get(BRAMBLE));
    for (const sim of [w.sim, loaded]) sim.tick(3 * HOUR);
    expect(loaded.familiars.get(BRAMBLE)!.care).toEqual(w.sim.familiars.get(BRAMBLE)!.care);
    // Care actions still work after loading.
    expect(loaded.modes.perform(w.me, { kind: 'rest-familiar', familiarId: BRAMBLE }).ok).toBe(true);
  });
});

describe('owning a Familiar never defines Canonical Recognition', () => {
  it('adoption and care leave Canonical stores empty and add no score anywhere', () => {
    const w = withBramble();
    w.must({ kind: 'feed-familiar', familiarId: BRAMBLE, itemId: BISCUITS });
    w.must({ kind: 'bond-familiar', familiarId: BRAMBLE });
    expect(w.sim.state.canonical).toEqual({ derived: {}, recognitions: {} });
    expect(findForbiddenKeys(w.sim.state.familiars)).toEqual([]);
    expect(findForbiddenKeys(w.sim.state.persons)).toEqual([]);
    const care = Object.values(w.sim.state.evidence).filter((e) => e.actionType.startsWith('familiar.'));
    expect(care.length).toBeGreaterThan(0);
    expect(care.every((e) => e.verification === 'system-observed')).toBe(true);
  });
});
