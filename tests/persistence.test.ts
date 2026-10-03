import { describe, expect, it } from 'vitest';
import { content } from '../src/config/content';
import { ManualClock, SequentialIdFactory, asId, type ActorId } from '../src/core';
import type { Intent } from '../src/modes';
import { MemoryStorage, SAVE_FORMAT, SaveService, checksum, migrateWorld, normalizeWorld, type StorageAdapter } from '../src/persistence';
import { MAX_CATCH_UP_MS, SAVE_SLOT, openSession, saveSession, type Session } from '../src/ui/session';
import { WORLD_SCHEMA_VERSION } from '../src/world';

const MARK = asId<'currency'>('currency_mark');
const L = (id: string) => asId<'location'>(`location_${id}`);
const HOUR = 3_600_000;

function open(storage: StorageAdapter, clock: ManualClock, seed = 7) {
  const saves = new SaveService(storage, () => clock.now());
  const session = openSession({
    content,
    saves,
    serverId: 'server_happy-fall-blackmere',
    startLocation: 'location_blackmere-square',
    clock,
    ids: new SequentialIdFactory(clock.now()), // unique per session so new ids never collide
    newWorldSeed: seed,
    displayName: 'Wren',
  });
  const act = (i: Intent) => {
    const r = session.sim.modes.perform(session.playerId, i);
    if (!r.ok) throw new Error(`${i.kind}: ${r.error.message}`);
    return r.value;
  };
  return { saves, session, act };
}

/** Play a short session that touches every major system. */
function playABit(s: Session, act: (i: Intent) => unknown) {
  act({ kind: 'travel', to: L('blackmere-market') });
  act({ kind: 'buy', marketId: asId('market_quills-sundries'), itemId: asId('item_hound-biscuits'), quantity: 1 });
  act({ kind: 'accept-contract', contractId: asId('contract_quill-apples') });
  act({ kind: 'travel', to: L('brindle-farm') });
  for (let i = 0; i < 3; i++) act({ kind: 'gather', nodeId: asId('rnode_brindle-orchard'), amount: 1 });
  act({ kind: 'acquire-familiar', familiarId: asId('familiar_bramble') });
  act({ kind: 'feed-familiar', familiarId: asId('familiar_bramble'), itemId: asId('item_hound-biscuits') });
  act({ kind: 'travel', to: L('blackmere-market') });
  act({ kind: 'complete-task', taskId: s.sim.contracts.get(asId('contract_quill-apples'))!.taskIds[0]! });
}

describe('save / load', () => {
  it('a new session founds a world; saving and reopening resumes it exactly', () => {
    const storage = new MemoryStorage();
    const clock = new ManualClock(1_700_000_000_000);
    const a = open(storage, clock);
    expect(a.session.resumed).toBe(false);
    playABit(a.session, a.act);
    const saved = saveSession(a.saves, a.session, { sceneId: 'blackmere-town', position: [19, 0] });
    expect(saved.ok).toBe(true);
    const before = JSON.parse(JSON.stringify(a.session.sim.state));

    const b = open(storage, clock);
    expect(b.session.resumed).toBe(true);
    expect(b.session.playerId).toBe(a.session.playerId);
    expect(b.session.presentation).toEqual({ sceneId: 'blackmere-town', position: [19, 0] });
    expect(b.session.sim.state).toEqual(before);

    const me = { kind: 'actor' as const, id: b.session.playerId };
    expect(b.session.sim.state.actors[me.id]!.locationId).toBe('location_blackmere-market');
    expect(b.session.sim.economy.balance(me, MARK)).toBe(40 - 2 - 12 + 20);
    expect(b.session.sim.familiars.ownerOf(asId('familiar_bramble'))).toEqual(me);
    expect(b.session.sim.contracts.get(asId('contract_quill-apples'))!.status).toBe('completed');
    expect(b.session.sim.chronicle.personal(me.id).entries().length).toBe(a.session.sim.chronicle.personal(me.id).entries().length);
  });

  it('the resumed world keeps working and keeps the same future (seeded randomness)', () => {
    const storage = new MemoryStorage();
    const clock = new ManualClock(1_700_000_000_000);
    const a = open(storage, clock);
    saveSession(a.saves, a.session, { sceneId: 'blackmere-town', position: [0, 3] });
    const b = open(storage, clock);
    const draws = (s: Session) => [1, 2, 3].map(() => s.sim.risk.resolve(asId('risk_small-venture'), 100).ok && s.sim.ctx.rng.next());
    expect(draws(b.session)).toEqual(draws(a.session));
    expect(() => b.act({ kind: 'travel', to: L('blackmere-tavern') })).not.toThrow();
  });

  it('returning later catches up time away, capped', () => {
    const storage = new MemoryStorage();
    const clock = new ManualClock(1_700_000_000_000);
    const a = open(storage, clock);
    a.act({ kind: 'travel', to: L('brindle-farm') });
    a.act({ kind: 'acquire-familiar', familiarId: asId('familiar_bramble') });
    saveSession(a.saves, a.session, { sceneId: 'blackmere-outskirts', position: [8, 7] });
    const satiety = a.session.sim.familiars.get(asId('familiar_bramble'))!.care.satiety;

    clock.advance(HOUR);
    const b = open(storage, clock);
    expect(b.session.awayMs).toBe(HOUR);
    expect(b.session.sim.familiars.get(asId('familiar_bramble'))!.care.satiety).toBeCloseTo(satiety - 8);

    clock.advance(10 * HOUR);
    const c = open(storage, clock);
    const lost = satiety - c.session.sim.familiars.get(asId('familiar_bramble'))!.care.satiety;
    expect(lost).toBeCloseTo(8 * (MAX_CATCH_UP_MS / HOUR));
  });
});

describe('save file integrity', () => {
  function savedText() {
    const storage = new MemoryStorage();
    const clock = new ManualClock(1_700_000_000_000);
    const a = open(storage, clock);
    saveSession(a.saves, a.session, { sceneId: 'blackmere-town', position: [0, 3] });
    return { text: a.saves.export(SAVE_SLOT)!, saves: a.saves, playerId: a.session.playerId };
  }

  it('is plain JSON with metadata and a checksum', () => {
    const { text, playerId } = savedText();
    const file = JSON.parse(text);
    expect(file.meta).toMatchObject({ format: SAVE_FORMAT, version: 1, slot: SAVE_SLOT, realmId: 'realm_happy-fall', playerActorId: playerId });
    expect(file.checksum).toBe(checksum(JSON.stringify(file.world)));
  });

  it.each([
    ['tampered world', (t: string) => t.replace('"Traveller"', '"Tr4veller"').replace('"Wren"', '"Wr3n"'), 'CORRUPT_SAVE'],
    ['truncated', (t: string) => t.slice(0, t.length / 2), 'CORRUPT_SAVE'],
    ['not a save', () => JSON.stringify({ meta: { format: 'something-else' } }), 'NOT_A_SAVE'],
    ['newer format', (t: string) => t.replace('"version":1', '"version":99'), 'NEWER_SAVE'],
  ])('rejects a %s', (_label, mangle, code) => {
    const { text, saves } = savedText();
    const r = saves.parse(mangle(text));
    expect(!r.ok && r.error.code).toBe(code);
  });

  it('rejects a world from a newer schema', () => {
    const { text, saves } = savedText();
    const file = JSON.parse(text);
    file.world.schemaVersion = WORLD_SCHEMA_VERSION + 1;
    file.checksum = checksum(JSON.stringify(file.world));
    const r = saves.parse(JSON.stringify(file));
    expect(!r.ok && r.error.code).toBe('MIGRATION_FAILED');
  });

  it('a damaged save falls back to a fresh world and reports why', () => {
    const storage = new MemoryStorage();
    const clock = new ManualClock(1_700_000_000_000);
    storage.set(`eotr:save:${SAVE_SLOT}`, '{"meta":{"format":"eotr-save","version":1},"checksum":"0","world":{}}');
    const s = open(storage, clock);
    expect(s.session.resumed).toBe(false);
    expect(s.session.loadError).toMatch(/checksum/);
  });

  it('reports storage failures instead of throwing', () => {
    const full: StorageAdapter = { get: () => null, set: () => { throw new Error('quota exceeded'); }, remove: () => {}, keys: () => [] };
    const clock = new ManualClock(1);
    const { session } = open(new MemoryStorage(), clock);
    const r = new SaveService(full, () => 1).save('x', { world: session.sim.state, playerActorId: session.playerId, worldTime: 1 });
    expect(!r.ok && r.error.code).toBe('STORAGE_FAILED');
  });

  it('lists, exports, imports and deletes saves', () => {
    const { text, saves } = savedText();
    expect(saves.list().map((m) => m.slot)).toEqual([SAVE_SLOT]);
    expect(saves.import('backup', text).ok).toBe(true);
    expect(saves.list().map((m) => m.slot).sort()).toEqual(['backup', SAVE_SLOT]);
    saves.delete('backup');
    expect(saves.has('backup')).toBe(false);
  });
});

describe('migrations', () => {
  it('apply in order from an older schema and fill new empty collections', () => {
    const old = { schemaVersion: 0, realm: { id: 'r' }, server: { id: 's' }, actors: {}, chronicle: [], legacyName: 'x' };
    const m = migrateWorld(old, { 0: (w) => ({ ...w, renamed: w.legacyName, legacyName: undefined }) }, 1);
    expect(m.applied).toEqual([0]);
    expect(m.world.schemaVersion).toBe(1);
    expect((m.world as unknown as { renamed: string }).renamed).toBe('x');
    expect(m.world.familiars).toEqual({});
    expect(m.world.canonical).toEqual({ derived: {}, recognitions: {} });
  });

  it('refuse to skip a missing step', () => {
    expect(() => migrateWorld({ schemaVersion: 0 }, {}, 1)).toThrow(/no migration from schema 0/);
  });

  it('normalizing never overwrites existing data', () => {
    const w = normalizeWorld({ flags: { kept: true } });
    expect(w.flags).toEqual({ kept: true });
  });
});

describe('Personal Chronicle', () => {
  function played() {
    const storage = new MemoryStorage();
    const clock = new ManualClock(1_700_000_000_000);
    const a = open(storage, clock);
    playABit(a.session, a.act);
    return a;
  }

  it('records the meaningful moments of play with full structure', () => {
    const { session } = played();
    const pc = session.sim.chronicle.personal(session.playerId);
    const events = pc.entries().map((e) => e.event);
    for (const e of ['realm.joined', 'location.discovered', 'contract.accepted', 'market.purchase', 'familiar.acquired', 'ownership.transferred', 'contract.completed', 'relationship.formed']) {
      expect(events, e).toContain(e);
    }
    const helped = pc.entries({ events: ['contract.completed'] })[0]!;
    expect(helped.summary).toBe("Helped Tobias Quill: Apples for Quill's");
    for (const e of pc.entries()) {
      expect(e).toMatchObject({ timestamp: expect.any(Number), event: expect.any(String), context: { realmId: 'realm_happy-fall', serverId: 'server_happy-fall-blackmere' }, sourceSystem: expect.any(String), visibility: expect.any(String) });
      expect(e.provenance.sourceSystem).toBeTruthy();
      expect(Array.isArray(e.participants)).toBe(true);
    }
  });

  it('filters by event family, location and time, pages, and summarizes', () => {
    const { session } = played();
    const pc = session.sim.chronicle.personal(session.playerId);
    expect(pc.entries({ events: ['familiar.'] }).map((e) => e.event)).toEqual(['familiar.acquired']);
    expect(pc.entries({ location: 'location_brindle-farm' }).every((e) => e.location === 'location_brindle-farm')).toBe(true);
    const all = pc.entries();
    expect(pc.entries({ limit: 2, offset: 1 })).toEqual(all.slice(1, 3));
    expect(pc.latest(1)[0]).toEqual(all.at(-1));
    expect(pc.entries({ since: all.at(-1)!.timestamp + 1 })).toEqual([]);
    const summary = pc.summary();
    expect(summary.contract).toBe(2);
    expect(summary.familiar).toBe(1);
  });

  it('respects visibility: private history stays private, Realm history is shared', () => {
    const { session } = played();
    const sim = session.sim;
    const other = asId<'actor'>('actor_sela-vantry') as ActorId;
    const mine = sim.chronicle.personal(session.playerId).entries();
    const seenByOther = sim.chronicle.personal(session.playerId).entries({ viewer: other });
    expect(seenByOther.length).toBeLessThan(mine.length);
    expect(seenByOther.every((e) => e.visibility !== 'private' || e.participants.includes(other))).toBe(true);
    const tobias = asId<'actor'>('actor_tobias-quill') as ActorId;
    const purchase = mine.find((e) => e.event === 'market.purchase')!;
    expect(sim.chronicle.canView(tobias, purchase)).toBe(false); // private, even to the vendor
    sim.market.setPriceIndex(asId('market_quills-sundries'), 1.1, 'test');
    expect(sim.chronicle.realm().entries({ viewer: other }).length).toBeGreaterThan(0);
  });

  it('records investments made, money lost, and route changes', () => {
    let lostSeen = false;
    for (let seed = 1; seed <= 30 && !lostSeen; seed++) {
      const storage = new MemoryStorage();
      const clock = new ManualClock(1_700_000_000_000);
      const a = open(storage, clock, seed);
      a.act({ kind: 'travel', to: L('brindle-farm') });
      a.act({ kind: 'accept-contract', contractId: asId('contract_cider-press') });
      clock.advance(60_000);
      a.act({ kind: 'complete-task', taskId: a.session.sim.contracts.get(asId('contract_cider-press'))!.taskIds[0]! });
      const pc = a.session.sim.chronicle.personal(a.session.playerId);
      expect(pc.entries({ events: ['investment.made'] })[0]!.summary).toBe('Invested 20 in A Share in the Cider Press');
      const loss = pc.entries({ events: ['economy.loss'] })[0];
      if (loss) {
        expect(loss.summary).toBe('Lost 20 on A Share in the Cider Press');
        lostSeen = true;
      }
    }
    expect(lostSeen).toBe(true);
    const { session } = open(new MemoryStorage(), new ManualClock(1));
    session.sim.world.setRouteStatus(asId('route_market-east-road'), 'hazardous', 'autumn floods');
    expect(session.sim.chronicle.realm().entries({ events: ['route.status-changed'] })[0]!.summary).toMatch(/hazardous \(autumn floods\)/);
  });
});
