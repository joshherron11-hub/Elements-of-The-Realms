import { describe, expect, it } from 'vitest';
import { content } from '../src/config/content';
import { ManualClock, SequentialIdFactory, asId, type ActorId } from '../src/core';
import type { Intent } from '../src/modes';
import { lightingAt } from '../src/render/lighting';
import { PALETTE } from '../src/render/stage';
import { bootstrapWorld, joinRealm } from '../src/seed';
import { Simulation } from '../src/simulation';
import { clockLabel, now, objectives, readableText, relationshipLabel } from '../src/ui/feedback';
import { eventToCue } from '../src/ui/sound';
import { parseLiving, routineAt, validateLiving, type WorldState } from '../src/world';
import livingJson from '../realms/happy-fall/living/blackmere.json';

const LIVING = content.living('realm_happy-fall');
const GAME_HOUR = LIVING.calendar.dayLengthMs / 24;
const MARK = asId<'currency'>('currency_mark');
const L = (id: string) => asId<'location'>(`location_${id}`);
const A = (id: string) => asId<'actor'>(`actor_${id}`) as ActorId;

function world(seed = 1, withLiving = true) {
  const clock = new ManualClock(1_000_000);
  const rules = content.rulesFor('server_happy-fall-blackmere');
  const r = bootstrapWorld({ rules, pack: content.pack(rules.realm.id), modes: content.modes, living: withLiving ? LIVING : undefined, seed, clock, ids: new SequentialIdFactory() });
  if (!r.ok) throw new Error(r.error.message);
  const sim = r.value;
  const j = joinRealm(sim, { displayName: 'Wren', startAt: L('blackmere-square') });
  if (!j.ok) throw new Error(j.error.message);
  const me = j.value.actor.id;
  const self = { kind: 'actor' as const, id: me };
  const act = (i: Intent) => sim.modes.perform(me, i);
  const must = (i: Intent) => {
    const out = act(i);
    if (!out.ok) throw new Error(`${i.kind}: ${out.error.message}`);
    return out.value;
  };
  /** Advance in-game time by whole hours, ticking each hour like the game loop would. */
  const hours = (n: number) => {
    for (let i = 0; i < n; i++) {
      clock.advance(GAME_HOUR);
      sim.tick(GAME_HOUR);
    }
  };
  return { sim, clock, me, self, act, must, hours };
}

describe('living config', () => {
  it('Blackmere config parses, and every routine covers all 24 hours with real places', () => {
    expect(parseLiving(livingJson).ok).toBe(true);
    const pack = content.pack('realm_happy-fall');
    const r = validateLiving(LIVING, {
      actors: new Set(pack.actors.map((a) => a.id)), locations: new Set(pack.locations.map((l) => l.id)),
      markets: new Set(pack.markets.map((m) => m.id)), items: new Set(pack.items.map((i) => i.id)), familiars: new Set(pack.familiars.map((f) => f.id)),
    });
    expect(r.ok, !r.ok ? r.error.message : '').toBe(true);
  });

  it('rejects routines with gaps or unknown places', () => {
    const bad = { ...LIVING, routines: { 'actor_pip-ashdown': [{ from: 8, to: 12, locationId: 'location_nowhere', activity: 'x' }] } };
    const r = validateLiving(bad, { actors: new Set(['actor_pip-ashdown']), locations: new Set(), markets: new Set(), items: new Set(), familiars: new Set() });
    expect(!r.ok && r.error.message).toMatch(/unknown location/);
    expect(!r.ok && r.error.message).toMatch(/no entry at hour 0/);
  });
});

describe('calendar', () => {
  it('a new world starts at 09:00 on day 1 and time runs at the configured day length', () => {
    const { sim, hours } = world();
    expect(now(sim)).toMatchObject({ day: 0, hour: 9, minute: 0, phase: 'day' });
    expect(clockLabel(now(sim))).toBe('Day 1 · 09:00 · Morning');
    hours(10);
    expect(now(sim)).toMatchObject({ day: 0, hour: 19, phase: 'dusk' });
    hours(6);
    expect(now(sim)).toMatchObject({ day: 1, hour: 1, phase: 'night' });
    expect(routineAt([{ from: 22, to: 6, locationId: 'x', activity: 'a' }], 3)?.activity).toBe('a'); // wraps midnight
  });

  it('a world founded without an explicit clock still starts its calendar at 09:00 (as in the browser)', () => {
    const rules = content.rulesFor('server_happy-fall-blackmere');
    const r = bootstrapWorld({ rules, pack: content.pack(rules.realm.id), modes: content.modes, living: LIVING, seed: 3 });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.state.createdAt).toBeGreaterThan(0);
    expect(now(r.value).hour).toBe(9);
  });
});

describe('NPC daily routines', () => {
  it('NPCs go about their day: Tobias trades, drinks at the tavern, sleeps at home', () => {
    const { sim, hours } = world();
    const where = (id: string) => sim.state.actors[A(id)]!.locationId;
    expect(where('tobias-quill')).toBe('location_blackmere-market');
    expect(sim.state.npcActivity[A('tobias-quill')]).toMatchObject({ activity: 'trading', spot: 'stall' });
    hours(10); // 19:00
    expect(where('tobias-quill')).toBe('location_blackmere-tavern');
    expect(where('pip-ashdown')).toBe('location_blackmere-tavern');
    expect(where('aldous-crane')).toBe('location_blackmere-tavern');
    hours(5); // 00:00
    expect(where('tobias-quill')).toBe('location_blackmere-hearth-row');
    expect(sim.state.npcActivity[A('maren-holloway')]!.activity).toBe('asleep');
    hours(9); // 09:00 next day
    expect(where('tobias-quill')).toBe('location_blackmere-market');
  });

  it('is deterministic, never chronicled, and never recorded as evidence', () => {
    const a = world();
    const b = world();
    a.hours(30);
    b.hours(30);
    expect(a.sim.state.npcActivity).toEqual(b.sim.state.npcActivity);
    const npcEntries = a.sim.state.chronicle.filter((e) => e.actor && a.sim.state.actors[e.actor]?.kind === 'npc');
    expect(npcEntries).toEqual([]);
    expect(Object.values(a.sim.state.evidence).some((e) => e.actionType === 'npc.routine')).toBe(false);
  });

  it('greetings follow what they are doing and how they feel about you', () => {
    const w = world();
    expect(w.must({ kind: 'talk', with: A('pip-ashdown') }).data!.greeting).toMatch(/letters don't carry themselves/);
    w.sim.relationships.adjust(A('pip-ashdown'), w.me, { regard: 20 }, 'test');
    expect(w.must({ kind: 'talk', with: A('pip-ashdown') }).data!.greeting).toMatch(/favourite satchel-finder/);
    w.hours(10); // evening: Pip tells stories at the tavern
    w.must({ kind: 'travel', to: L('blackmere-tavern') });
    const t = w.must({ kind: 'talk', with: A('pip-ashdown') });
    expect(t.data).toMatchObject({ activity: 'telling-stories' });
    expect(t.data!.greeting).toMatch(/low road past Hollowmere/);
  });

  it('a world without living rules keeps everyone where the content placed them', () => {
    const { sim, hours } = world(1, false);
    hours(12);
    expect(sim.state.actors[A('tobias-quill')]!.locationId).toBe('location_blackmere-market');
    expect(sim.state.npcActivity).toEqual({});
  });
});

describe('market hours and morning restock', () => {
  it('Quill’s closes in the evening and opens in the morning', () => {
    const w = world();
    w.must({ kind: 'travel', to: L('blackmere-market') });
    w.hours(10); // 19:00
    const shut = w.act({ kind: 'buy', marketId: asId('market_quills-sundries'), itemId: asId('item_lantern-oil'), quantity: 1 });
    expect(!shut.ok && shut.error.code).toBe('MARKET_CLOSED');
    w.hours(12); // 07:00
    expect(w.act({ kind: 'buy', marketId: asId('market_quills-sundries'), itemId: asId('item_lantern-oil'), quantity: 1 }).ok).toBe(true);
  });

  it('stock is topped up once per day and never above target', () => {
    const w = world();
    const tobias = { kind: 'actor' as const, id: A('tobias-quill') };
    w.must({ kind: 'travel', to: L('blackmere-market') });
    for (let i = 0; i < 3; i++) w.must({ kind: 'buy', marketId: asId('market_quills-sundries'), itemId: asId('item_lantern-oil'), quantity: 1 });
    expect(w.sim.inventory.count(tobias, asId('item_lantern-oil'))).toBe(7);
    w.hours(5);
    expect(w.sim.inventory.count(tobias, asId('item_lantern-oil'))).toBe(7); // same day: no delivery
    w.hours(10); // past midnight
    expect(w.sim.inventory.count(tobias, asId('item_lantern-oil'))).toBe(10);
    w.hours(24);
    expect(w.sim.inventory.count(tobias, asId('item_lantern-oil'))).toBe(10);
  });
});

describe('player market stall (ownership use)', () => {
  function stallOwner(seed = 1) {
    const w = world(seed);
    w.must({ kind: 'travel', to: L('blackmere-keep') });
    w.must({ kind: 'purchase-property', propertyId: asId('property_stall-4') });
    w.must({ kind: 'travel', to: L('brindle-farm') });
    for (let i = 0; i < 6; i++) w.must({ kind: 'gather', nodeId: asId('rnode_brindle-orchard'), amount: 1 });
    w.must({ kind: 'travel', to: L('blackmere-market') });
    return w;
  }
  const list = (w: ReturnType<typeof world>, price: number | null) =>
    w.act({ kind: 'set-stall-listing', propertyId: asId('property_stall-4'), itemId: asId('item_russet-apples'), price });

  it('only the owner, at the stall, holding the goods, at a sane price, can list', () => {
    const w = world();
    w.must({ kind: 'travel', to: L('blackmere-market') });
    const notMine = list(w, 6);
    expect(!notMine.ok && notMine.error.code).toBe('NOT_OWNER');
    const o = stallOwner();
    const tooHigh = list(o, 100);
    expect(!tooHigh.ok && tooHigh.error.code).toBe('PRICE_TOO_HIGH');
    expect(list(o, 6).ok).toBe(true);
    o.must({ kind: 'travel', to: L('blackmere-square') });
    const away = list(o, 7);
    expect(!away.ok && away.error.code).toBe('NOT_PRESENT');
    expect(o.sim.chronicle.personal(o.me).entries().some((e) => e.event === 'stall.opened')).toBe(true);
  });

  it('passers-by buy over the day, deterministically; coin is ledgered; stock runs out', () => {
    const run = (seed: number) => {
      const w = stallOwner(seed);
      expect(list(w, 6).ok).toBe(true);
      const before = w.sim.economy.balance(w.self, MARK);
      w.hours(30);
      const stall = w.sim.stall.get('property_stall-4')!;
      return { w, sales: stall.sales, earnings: stall.earnings, gained: w.sim.economy.balance(w.self, MARK) - before, left: w.sim.inventory.count(w.self, asId('item_russet-apples')) };
    };
    const a = run(3);
    expect({ ...run(3), w: undefined }).toEqual({ ...a, w: undefined });
    expect(a.sales).toBeGreaterThan(0);
    expect(a.sales + a.left).toBe(6);
    expect(a.gained).toBe(a.earnings);
    expect(a.w.sim.state.ledger.filter((l) => l.reason === 'stall sale').length).toBe(a.sales);
    expect(a.w.sim.chronicle.personal(a.w.me).entries({ events: ['stall.sale'] })).toHaveLength(a.sales);
  });

  it('overpriced goods never sell; nothing sells outside opening hours', () => {
    const w = stallOwner();
    const max = Math.floor(w.sim.stall.referencePrice('item_russet-apples') * LIVING.stall.maxPriceMultiple);
    expect(w.sim.stall.saleChance('item_russet-apples', max)).toBe(0);
    expect(list(w, max).ok).toBe(true);
    w.hours(48);
    expect(w.sim.stall.get('property_stall-4')!.sales).toBe(0);
    const night = stallOwner(5);
    night.hours(10); // 19:00, closed
    expect(list(night, 6).ok).toBe(true);
    night.hours(11); // until 06:00
    expect(night.sim.stall.get('property_stall-4')!.sales).toBe(0);
  });

  it('a stall in progress survives save/load and keeps selling identically', () => {
    const w = stallOwner(9);
    list(w, 6);
    w.hours(3);
    const copy = new Simulation({ state: JSON.parse(JSON.stringify(w.sim.state)) as WorldState, clock: new ManualClock(w.clock.now()), ids: new SequentialIdFactory(9000), rules: w.sim.ctx.rules, modes: content.modes, living: LIVING }).start();
    for (let i = 0; i < 6; i++) {
      w.clock.advance(GAME_HOUR);
      w.sim.tick(GAME_HOUR);
      (copy.ctx.clock as ManualClock).advance(GAME_HOUR);
      copy.tick(GAME_HOUR);
    }
    expect(copy.state.stalls).toEqual(w.sim.state.stalls);
    expect(copy.economy.balance(w.self, MARK)).toBe(w.sim.economy.balance(w.self, MARK));
  });
});

describe('Wicket Cottage (property interior)', () => {
  it('is locked to everyone but its owner, then becomes a home with deeper Familiar rest', () => {
    const w = world();
    w.must({ kind: 'travel', to: L('blackmere-hearth-row') });
    const locked = w.act({ kind: 'travel', to: L('wicket-cottage') });
    expect(!locked.ok && locked.error.code).toBe('LOCKED');
    expect(!locked.ok && locked.error.message).toMatch(/belongs to Blackmere Town Council/);

    w.sim.economy.mint(w.self, MARK, 200, { reason: 'test purse' });
    w.must({ kind: 'travel', to: L('blackmere-keep') });
    w.must({ kind: 'purchase-property', propertyId: asId('property_wicket-cottage') });
    w.must({ kind: 'travel', to: L('brindle-farm') });
    w.must({ kind: 'acquire-familiar', familiarId: asId('familiar_bramble') });
    w.must({ kind: 'travel', to: L('wicket-cottage') });
    expect(w.sim.state.actors[w.sim.familiars.get(asId('familiar_bramble'))!.actorId]!.locationId).toBe('location_wicket-cottage');
    w.sim.modes.enter(w.me, 'COMPANION');
    const rest = w.must({ kind: 'rest-familiar', familiarId: asId('familiar_bramble') });
    expect(rest.data).toMatchObject({ atHome: true });
    expect(rest.summary).toMatch(/claims the spot by the hearth/);
    expect(w.sim.familiars.get(asId('familiar_bramble'))!.care.energy).toBe(100); // 75 + 80, capped
  });
});

describe('Familiar personality', () => {
  it('reactions are individual where authored, species-wide otherwise, and deterministic', () => {
    const w = world();
    w.must({ kind: 'travel', to: L('blackmere-market') });
    w.must({ kind: 'buy', marketId: asId('market_quills-sundries'), itemId: asId('item_hound-biscuits'), quantity: 1 });
    w.must({ kind: 'travel', to: L('brindle-farm') });
    const adopt = w.must({ kind: 'acquire-familiar', familiarId: asId('familiar_bramble') });
    expect(adopt.summary).toMatch(/Bramble skids to a stop/); // individual line
    w.sim.modes.enter(w.me, 'COMPANION');
    const fed = w.must({ kind: 'feed-familiar', familiarId: asId('familiar_bramble'), itemId: asId('item_hound-biscuits') });
    expect(LIVING.familiarReactions['species_russet-hound']!.fed!.some((l) => fed.summary.startsWith(l.replaceAll('{name}', 'Bramble')))).toBe(true);
    const status = w.sim.familiars.status(asId('familiar_bramble'));
    expect(status.ok && status.value.mood).toMatch(/Bramble/);
    expect(w.sim.familiars.reaction(w.sim.familiars.get(asId('familiar_bramble'))!, 'fed')).toBe(w.sim.familiars.reaction(w.sim.familiars.get(asId('familiar_bramble'))!, 'fed'));
  });
});

describe('presentation helpers', () => {
  it('relationship labels describe one person’s view, never a rank', () => {
    expect(relationshipLabel(undefined).label).toBe('Stranger');
    const r = (regard: number, trust: number, familiarity = 0) => ({ from: A('a'), to: A('b'), regard, trust, familiarity, tags: [], since: 0, lastInteractionAt: 0 });
    expect(relationshipLabel(r(0, 0, 2)).label).toBe('Acquaintance');
    expect(relationshipLabel(r(12, 0)).label).toBe('Friendly');
    expect(relationshipLabel(r(30, 25)).label).toBe('Trusted');
    expect(relationshipLabel(r(-10, 0)).tone).toBe('cold');
  });

  it('notice board, price board and deed read live world state', () => {
    const w = world();
    const notice = readableText(w.sim, w.me, { id: 'n', at: [0, 0], title: 'n', dynamic: 'notice-board' });
    expect(notice.join('\n')).toMatch(/WANTED — The Lost Satchel \(ask Pip Ashdown\)/);
    expect(notice.join('\n')).toMatch(/FOR SALE — Wicket Cottage/);
    const prices = readableText(w.sim, w.me, { id: 'p', at: [0, 0], title: 'p', dynamic: 'market-prices' });
    expect(prices[0]).toBe('OPEN');
    expect(prices.join('\n')).toMatch(/Quill buys: .*Wheat Sheaf/);
    const deed = readableText(w.sim, w.me, { id: 'd', at: [0, 0], title: 'd', dynamic: 'deed', propertyId: 'property_wicket-cottage' });
    expect(deed[0]).toMatch(/held by Blackmere Town Council/);
  });

  it('objectives show readiness of accepted work', () => {
    const w = world();
    w.must({ kind: 'accept-contract', contractId: asId('contract_pip-satchel') });
    const obj = objectives(w.sim, w.me);
    expect(obj).toHaveLength(2);
    expect(obj[0]).toMatchObject({ contract: 'The Lost Satchel', ready: false });
  });

  it('sound cues map from the player’s point of view', () => {
    const ev = (type: string, actor?: string, payload: unknown = {}) => ({ type, at: 0, payload, meta: { actor } });
    expect(eventToCue(ev('market.purchase', 'me'), 'me')).toBe('coin-out');
    expect(eventToCue(ev('market.purchase', 'someone-else'), 'me')).toBeUndefined();
    expect(eventToCue(ev('contract.completed', 'me'), 'me')).toBe('quest-done');
    expect(eventToCue(ev('actor.travelled', undefined, { actorId: 'me' }), 'me')).toBe('step');
    expect(eventToCue(ev('npc.routine'), 'me')).toBeUndefined();
  });

  it('lighting runs warm by day, dark with lamps lit at night', () => {
    const noon = lightingAt(12, PALETTE);
    const midnight = lightingAt(0, PALETTE);
    expect(noon.sunIntensity).toBeGreaterThan(midnight.sunIntensity);
    expect(noon.lamps).toBe(0);
    expect(midnight.lamps).toBe(1);
    expect(lightingAt(24, PALETTE)).toEqual(lightingAt(0, PALETTE));
  });
});

