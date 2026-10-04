import { describe, expect, it } from 'vitest';
import { content } from '../src/config/content';
import { ManualClock, SequentialIdFactory, asId } from '../src/core';
import type { Intent } from '../src/modes';
import { MemoryStorage, SaveService } from '../src/persistence';
import { nextStep } from '../src/ui/guide';
import { openSession, saveSession } from '../src/ui/session';

/**
 * THE FIRST COMPLETE PLAYABLE LOOP — the current success criterion.
 *
 * ENTER BLACKMERE → MOVE THROUGH TOWN → SPEAK TO NPC → RECEIVE SMALL CONTRACT
 * → VISIT MARKET → PURCHASE OR ACQUIRE A COMPANION → CARE FOR COMPANION
 * → COMPLETE SEARCH OR DELIVERY → RECEIVE CURRENCY / REPUTATION
 * → MAKE ONE SMALL INVESTMENT OR OWNERSHIP DECISION → CHRONICLE RECORDS THE
 * EXPERIENCE → SAVE → RELOAD → STATE REMAINS
 *
 * Everything below goes through player intents (`sim.modes.perform`), exactly
 * as the browser does — no service is called directly to change state.
 */
const L = (id: string) => asId<'location'>(`location_${id}`);
const MARK = asId<'currency'>('currency_mark');
const BLACKMERE = { kind: 'location' as const, id: 'location_blackmere' };

describe('first complete playable loop', () => {
  it('runs end to end and survives save + reload', () => {
    const storage = new MemoryStorage();
    const clock = new ManualClock(1_760_000_000_000);
    const saves = new SaveService(storage, () => clock.now());
    const open = () =>
      openSession({ content, saves, serverId: 'server_happy-fall-blackmere', startLocation: 'location_blackmere-square', clock, ids: new SequentialIdFactory(clock.now()), newWorldSeed: 11, displayName: 'Wren' });

    // ENTER BLACKMERE
    const s = open();
    expect(s.resumed).toBe(false);
    const { sim, playerId } = s;
    const me = { kind: 'actor' as const, id: playerId };
    const act = (i: Intent) => {
      const r = sim.modes.perform(playerId, i);
      if (!r.ok) throw new Error(`${i.kind} failed: ${r.error.message}`);
      clock.advance(1000);
      return r.value;
    };
    const coin = () => sim.economy.balance(me, MARK);
    expect(sim.state.actors[playerId]!.locationId).toBe('location_blackmere-square');
    expect(coin()).toBe(40);
    expect(nextStep(sim, playerId, { saved: false })!.key).toBe('talk');

    // MOVE THROUGH TOWN
    act({ kind: 'travel', to: L('blackmere-hearth-row') });
    act({ kind: 'travel', to: L('blackmere-square') });

    // SPEAK TO NPC → RECEIVE SMALL CONTRACT
    const talk = act({ kind: 'talk', with: asId('actor_pip-ashdown') });
    expect(talk.data!.greeting).toMatch(/letters don't carry themselves/);
    const offer = (talk.data!.offers as { contractId: string; title: string }[])[0]!;
    expect(offer.title).toBe('The Lost Satchel');
    act({ kind: 'accept-contract', contractId: asId(offer.contractId) });
    expect(nextStep(sim, playerId, { saved: false })!.key).toBe('market');

    // VISIT MARKET
    act({ kind: 'travel', to: L('blackmere-market') });
    act({ kind: 'buy', marketId: asId('market_quills-sundries'), itemId: asId('item_hound-biscuits'), quantity: 1 });
    act({ kind: 'buy', marketId: asId('market_quills-sundries'), itemId: asId('item_hound-biscuits'), quantity: 1 });
    expect(coin()).toBe(36);

    // PURCHASE OR ACQUIRE A COMPANION
    act({ kind: 'travel', to: L('brindle-farm') });
    act({ kind: 'acquire-familiar', familiarId: asId('familiar_bramble') });
    expect(sim.familiars.ownerOf(asId('familiar_bramble'))).toEqual(me);
    expect(coin()).toBe(24);

    // CARE FOR COMPANION
    sim.modes.enter(playerId, 'COMPANION');
    act({ kind: 'feed-familiar', familiarId: asId('familiar_bramble'), itemId: asId('item_hound-biscuits') });
    act({ kind: 'bond-familiar', familiarId: asId('familiar_bramble') });
    const status = act({ kind: 'familiar-status' });
    expect(status.summary).toMatch(/Bramble the russet hound: bond 13, well fed/);

    // COMPLETE SEARCH OR DELIVERY
    sim.modes.enter(playerId, 'SEARCH');
    act({ kind: 'travel', to: L('hollowmere-wood') });
    expect(sim.state.actors[sim.familiars.get(asId('familiar_bramble'))!.actorId]!.locationId).toBe('location_hollowmere-wood');
    const found = act({ kind: 'search' });
    expect(found.summary).toMatch(/Pip's satchel/);
    const [findTask, returnTask] = sim.contracts.get(asId(offer.contractId))!.taskIds;
    act({ kind: 'complete-task', taskId: findTask! });
    act({ kind: 'travel', to: L('blackmere-square') });
    const done = act({ kind: 'complete-task', taskId: returnTask! });
    expect(done.summary).toBe('The Lost Satchel: completed');

    // RECEIVE CURRENCY / REPUTATION
    expect(coin()).toBe(39);
    expect(sim.reputation.get(me, BLACKMERE)).toBe(5);
    expect(sim.relationships.get(asId('actor_pip-ashdown'), playerId)).toMatchObject({ regard: 10, trust: 10 });

    // MAKE ONE SMALL INVESTMENT OR OWNERSHIP DECISION
    sim.modes.enter(playerId, 'LIVE');
    act({ kind: 'travel', to: L('blackmere-keep') });
    act({ kind: 'purchase-property', propertyId: asId('property_stall-4') });
    expect(sim.property.ownerOf(asId('property_stall-4'))).toEqual(me);
    expect(coin()).toBe(9);

    // CHRONICLE RECORDS THE EXPERIENCE
    const story = sim.chronicle.personal(playerId).entries();
    const events = story.map((e) => e.event);
    for (const e of ['realm.joined', 'location.discovered', 'relationship.formed', 'contract.accepted', 'market.purchase', 'familiar.acquired', 'search.found', 'contract.completed', 'property.purchased', 'ownership.transferred']) {
      expect(events, e).toContain(e);
    }
    expect(story.find((e) => e.event === 'contract.completed')!.summary).toBe('Helped Pip Ashdown: The Lost Satchel');
    expect(nextStep(sim, playerId, { saved: false })!.key).toBe('save');

    // SAVE
    const saved = saveSession(saves, s, { sceneId: 'blackmere-town', position: [2.5, -20] });
    expect(saved.ok).toBe(true);
    const snapshot = JSON.parse(JSON.stringify(sim.state));

    // RELOAD → STATE REMAINS
    const back = open();
    expect(back.resumed).toBe(true);
    expect(back.playerId).toBe(playerId);
    expect(back.sim.state).toEqual(snapshot);
    expect(back.presentation).toEqual({ sceneId: 'blackmere-town', position: [2.5, -20] });
    const b = back.sim;
    expect(b.state.actors[playerId]!.locationId).toBe('location_blackmere-keep');
    expect(b.economy.balance(me, MARK)).toBe(9);
    expect(b.familiars.ownerOf(asId('familiar_bramble'))).toEqual(me);
    expect(b.familiars.get(asId('familiar_bramble'))!.bond).toBe(13);
    expect(b.property.ownerOf(asId('property_stall-4'))).toEqual(me);
    expect(b.contracts.get(asId(offer.contractId))!.status).toBe('completed');
    expect(b.reputation.get(me, BLACKMERE)).toBe(5);
    expect(b.chronicle.personal(playerId).entries()).toEqual(story);
    expect(nextStep(b, playerId, { saved: true })).toBeUndefined();

    // …and the loaded world is alive: play continues.
    expect(b.modes.perform(playerId, { kind: 'travel', to: L('blackmere-square') }).ok).toBe(true);
    expect(b.state.canonical).toEqual({ derived: {}, recognitions: {} });
  });
});
