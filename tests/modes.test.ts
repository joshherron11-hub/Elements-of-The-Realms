import { describe, expect, it } from 'vitest';
import modesJson from '../modes/modes.json';
import { content } from '../src/config/content';
import { MODE_KEYS, parseModes, type Intent } from '../src/modes';
import { Simulation } from '../src/simulation';
import { createWorldState, type ResolvedRules } from '../src/world';
import { ManualClock, SequentialIdFactory } from '../src/core';
import { ID, MODES, baker, farmer, makeSim, player } from './helpers/fixture';

const IMPLEMENTED = ['COMPANION', 'EXPLORE', 'INVEST', 'LIVE', 'SEARCH', 'SOCIAL'];

describe('mode definitions', () => {
  it('defines all 17 modes; exactly the first-build six are implemented', () => {
    expect(MODES.map((m) => m.key).sort()).toEqual([...MODE_KEYS].sort());
    expect(MODES.filter((m) => m.status === 'implemented').map((m) => m.key).sort()).toEqual(IMPLEMENTED);
  });

  it('rejects malformed mode data', () => {
    const bad = JSON.parse(JSON.stringify(modesJson));
    bad.modes[0].intents = ['teleport'];
    bad.modes.pop();
    const r = parseModes(bad);
    expect(!r.ok && r.error.message).toMatch(/intents\[0\]/);
    expect(!r.ok && r.error.message).toMatch(/missing mode SOCIAL/);
  });
});

describe('entering modes under server rules', () => {
  function simWith(rules: ResolvedRules) {
    const state = createWorldState({ realm: { id: rules.realm.id, name: 'x', type: 'ANCHORED' }, server: { id: rules.server.id, name: 'x', preset: 'PEACEFUL' }, seed: 1, now: 0 });
    return new Simulation({ state, clock: new ManualClock(), ids: new SequentialIdFactory(), rules, modes: MODES }).start();
  }

  it('on the Blackmere PEACEFUL server all six implemented modes can be entered; War and Duel cannot', () => {
    const sim = simWith(content.rulesFor('server_happy-fall-blackmere'));
    for (const k of IMPLEMENTED) expect(sim.modes.canEnter(k as never).ok, k).toBe(true);
    const war = sim.modes.canEnter('WAR');
    expect(!war.ok && war.error.code).toBe('MODE_NOT_AVAILABLE');
    expect(sim.modes.canEnter('DUEL').ok).toBe(false);
  });

  it('a Realm that does not recognise investment refuses Invest mode', () => {
    const rules = structuredClone(content.rulesFor('server_happy-fall-blackmere'));
    rules.realm.constitution.legalInteractions = rules.realm.constitution.legalInteractions.filter((c) => c !== 'investment');
    const sim = simWith(rules);
    const r = sim.modes.canEnter('INVEST');
    expect(!r.ok && r.error.code).toBe('RULES_FORBID');
  });
});

describe('intents', () => {
  function world() {
    const f = makeSim();
    f.sim.contracts.offer({
      id: 'contract_errand' as never, kind: 'search', title: 'Find the lost parcel', description: '', issuer: baker, locationId: ID.shop,
      tasks: [{ title: 'Find it', requirement: { kind: 'acquire', itemId: ID.parcel, quantity: 1 } }],
      terms: { rewards: [{ kind: 'currency', currencyId: ID.coin, amount: 12 }], penalties: [] },
    });
    f.sim.contracts.offer({
      id: 'contract_mill' as never, kind: 'investment', title: 'Back the mill', description: '', issuer: baker, locationId: ID.shop,
      tasks: [{ title: 'Wait for harvest', requirement: { kind: 'custom', key: 'harvest' } }],
      terms: { rewards: [], penalties: [], stake: { currencyId: ID.coin, amount: 20 }, riskProfileId: ID.venture },
    });
    f.state.searchSpots['spot_parcel'] = { id: 'spot_parcel', locationId: ID.farm, itemId: ID.parcel, quantity: 1, description: 'A parcel lies in the ditch.', requiresFlag: 'contract:contract_errand', foundBy: [] };
    f.state.searchSpots['spot_coin'] = { id: 'spot_coin', locationId: ID.farm, itemId: ID.bread, quantity: 1, description: 'A forgotten loaf.', foundBy: [] };
    return f;
  }
  const kinds = (xs: Intent[]) => [...new Set(xs.map((x) => x.kind))].sort();

  it('LIVE (default) offers travel, talk, buy, search and local contracts', () => {
    const { sim } = world();
    sim.world.travel(ID.player, ID.shop);
    expect(sim.modes.current(ID.player)).toBe('LIVE');
    const av = sim.modes.available(ID.player);
    expect(kinds(av)).toEqual(['accept-contract', 'buy', 'search', 'talk', 'travel']);
    expect(av).toContainEqual({ kind: 'buy', marketId: ID.market, itemId: ID.bread, quantity: 1 });
    expect(av).toContainEqual({ kind: 'talk', with: ID.baker });
  });

  it('modes narrow what is possible', () => {
    const { sim } = world();
    sim.world.travel(ID.player, ID.shop);
    sim.modes.enter(ID.player, 'SOCIAL');
    expect(kinds(sim.modes.available(ID.player))).toEqual(['talk', 'travel']);
    const r = sim.modes.perform(ID.player, { kind: 'buy', marketId: ID.market, itemId: ID.bread, quantity: 1 });
    expect(!r.ok && r.error.code).toBe('NOT_IN_MODE');
    sim.modes.enter(ID.player, 'INVEST');
    const offers = sim.modes.available(ID.player).filter((i) => i.kind === 'accept-contract');
    expect(offers).toEqual([{ kind: 'accept-contract', contractId: 'contract_mill' }]);
    const wrongKind = sim.modes.perform(ID.player, { kind: 'accept-contract', contractId: 'contract_errand' as never });
    expect(!wrongKind.ok && wrongKind.error.code).toBe('NOT_IN_MODE');
  });

  it('buying requires being at the market', () => {
    const { sim } = world();
    const r = sim.modes.perform(ID.player, { kind: 'buy', marketId: ID.market, itemId: ID.bread, quantity: 1 });
    expect(!r.ok && r.error.code).toBe('NOT_PRESENT');
    expect(sim.economy.balance(player, ID.coin)).toBe(100);
  });

  it('talking builds familiarity, records evidence and surfaces that NPC’s offers', () => {
    const { sim } = world();
    sim.world.travel(ID.player, ID.shop);
    const r = sim.modes.perform(ID.player, { kind: 'talk', with: ID.baker });
    expect(r.ok && (r.value.data!.offers as { contractId: string }[]).map((o) => o.contractId).sort()).toEqual(['contract_errand', 'contract_mill']);
    expect(sim.relationships.get(ID.player, ID.baker)!.familiarity).toBe(2);
    expect(sim.relationships.get(ID.baker, ID.player)!.familiarity).toBe(2);
    expect(sim.interactions.byActor(ID.player).some((i) => i.actionType === 'social.talked')).toBe(true);
    sim.modes.perform(ID.player, { kind: 'talk', with: ID.baker });
    const formed = sim.chronicle.personal(ID.player).entries().filter((e) => e.event === 'relationship.formed');
    expect(formed).toHaveLength(1);
    const away = sim.modes.perform(ID.player, { kind: 'talk', with: ID.farmer });
    expect(!away.ok && away.error.code).toBe('NOT_PRESENT');
  });

  it('SEARCH: a contract-gated find appears only after accepting the contract, and only once', () => {
    const { sim } = world();
    sim.modes.enter(ID.player, 'SEARCH');
    sim.world.travel(ID.player, ID.farm);
    let r = sim.modes.perform(ID.player, { kind: 'search' });
    expect(r.ok && (r.value.data!.found as unknown[]).length).toBe(1); // only the loaf
    expect(sim.inventory.count(player, ID.parcel)).toBe(0);

    sim.world.travel(ID.player, ID.shop);
    expect(sim.modes.perform(ID.player, { kind: 'accept-contract', contractId: 'contract_errand' as never }).ok).toBe(true);
    sim.world.travel(ID.player, ID.farm);
    r = sim.modes.perform(ID.player, { kind: 'search' });
    expect(r.ok && r.value.summary).toBe('A parcel lies in the ditch.');
    r = sim.modes.perform(ID.player, { kind: 'search' });
    expect(r.ok && r.value.summary).toBe('You find nothing of note.');

    const task = sim.modes.available(ID.player).find((i) => i.kind === 'complete-task');
    expect(task).toBeDefined();
    const done = sim.modes.perform(ID.player, task!);
    expect(done.ok && done.value.summary).toBe('Find the lost parcel: completed');
    expect(sim.economy.balance(player, ID.coin)).toBe(112);
    expect(sim.chronicle.personal(ID.player).entries().map((e) => e.context.mode)).toContain('SEARCH');
  });

  it('accepting an offer requires being where it is offered', () => {
    const { sim } = world();
    sim.world.travel(ID.player, ID.farm);
    const r = sim.modes.perform(ID.player, { kind: 'accept-contract', contractId: 'contract_errand' as never });
    expect(!r.ok && r.error.code).toBe('NOT_PRESENT');
    expect(sim.inventory.count(farmer, ID.parcel)).toBe(0);
  });
});
