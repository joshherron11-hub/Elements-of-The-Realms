import { describe, expect, it } from 'vitest';
import { content } from '../src/config/content';
import { ManualClock, SequentialIdFactory, asId, type ActorId } from '../src/core';
import { findForbiddenKeys } from '../src/identity';
import type { Intent } from '../src/modes';
import { bootstrapWorld, joinRealm } from '../src/seed';

const MARK = asId<'currency'>('currency_mark');
const L = (id: string) => asId<'location'>(`location_${id}`);
const A = (id: string) => asId<'actor'>(`actor_${id}`);

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
  const act = (i: Intent) => {
    const out = sim.modes.perform(me, i);
    if (!out.ok) throw new Error(`${i.kind}: ${out.error.message}`);
    return out.value;
  };
  const go = (loc: string) => act({ kind: 'travel', to: L(loc) });
  const coin = () => sim.economy.balance(self, MARK);
  const events = () => sim.chronicle.personal(me).entries().map((e) => e.event);
  return { sim, clock, me, self, act, go, coin, events };
}

describe('organizations and faction placeholders', () => {
  it('seeds a council, guilds, a clan and a faction', () => {
    const { sim } = world();
    const kinds = Object.values(sim.state.organizations).map((o) => o.kind).sort();
    expect(kinds).toEqual(['clan', 'faction', 'government', 'guild', 'guild']);
    expect(sim.authority.can(A('aldous-crane'), 'org.invite', { kind: 'organization', id: 'org_blackmere-council' })).toBe(true);
  });
});

describe('merchant contract: Apples for Quill’s', () => {
  it('gather at Brindle Farm, deliver to Tobias, get paid in coin, reputation and regard', () => {
    const w = world();
    w.go('blackmere-market');
    const talk = w.act({ kind: 'talk', with: A('tobias-quill') });
    expect((talk.data!.offers as { contractId: string }[]).map((o) => o.contractId)).toContain('contract_quill-apples');
    w.act({ kind: 'accept-contract', contractId: asId('contract_quill-apples') });
    w.go('brindle-farm');
    for (let i = 0; i < 3; i++) w.act({ kind: 'gather', nodeId: asId('rnode_brindle-orchard'), amount: 1 });
    w.go('blackmere-market');
    const task = w.sim.contracts.get(asId('contract_quill-apples'))!.taskIds[0]!;
    const done = w.act({ kind: 'complete-task', taskId: task });
    expect(done.summary).toBe("Apples for Quill's: completed");
    expect(w.coin()).toBe(60);
    expect(w.sim.reputation.get(w.self, { kind: 'location', id: 'location_blackmere' })).toBe(4);
    expect(w.sim.reputation.get(w.self, { kind: 'organization', id: 'org_merchants-circle' })).toBe(6);
    expect(w.sim.relationships.get(A('tobias-quill'), w.me)).toMatchObject({ regard: 8, trust: 6 });
    expect(w.events()).toContain('contract.completed');
  });
});

describe('search contract: The Lost Satchel', () => {
  it('the satchel can only be found after taking the job; finding and returning it pays out', () => {
    const w = world();
    w.go('hollowmere-wood');
    const early = w.act({ kind: 'search' });
    expect((early.data!.found as { itemId: string }[]).map((f) => f.itemId)).toEqual(['item_brass-locket']);

    w.go('blackmere-square');
    w.act({ kind: 'accept-contract', contractId: asId('contract_pip-satchel') });
    w.sim.modes.enter(w.me, 'SEARCH');
    w.go('hollowmere-wood');
    const found = w.act({ kind: 'search' });
    expect(found.summary).toMatch(/Pip's satchel/);
    const [find, deliver] = w.sim.contracts.get(asId('contract_pip-satchel'))!.taskIds;
    w.act({ kind: 'complete-task', taskId: find! });
    w.go('blackmere-square');
    w.act({ kind: 'complete-task', taskId: deliver! });
    expect(w.coin()).toBe(55);
    expect(w.sim.inventory.count({ kind: 'actor', id: A('pip-ashdown') }, asId('item_courier-satchel'))).toBe(1);
    expect(w.sim.chronicle.personal(w.me).entries().find((e) => e.event === 'contract.completed')!.context.mode).toBe('SEARCH');
  });
});

describe('social event: a toast with a stranger', () => {
  it('fires once on first talking to Sela, warming two relationships and local standing', () => {
    const w = world();
    w.go('blackmere-tavern');
    w.act({ kind: 'talk', with: A('sela-vantry') });
    w.act({ kind: 'talk', with: A('sela-vantry') });
    const occurred = w.sim.chronicle.personal(w.me).entries().filter((e) => e.event === 'happening.occurred');
    expect(occurred).toHaveLength(1);
    expect(occurred[0]!.participants.sort()).toEqual([A('maren-holloway'), A('sela-vantry')].sort());
    expect(w.sim.relationships.get(A('sela-vantry'), w.me)).toMatchObject({ regard: 8, trust: 4 });
    expect(w.sim.relationships.get(A('maren-holloway'), w.me)!.regard).toBe(4);
    expect(w.sim.reputation.get(w.self, { kind: 'location', id: 'location_blackmere' })).toBe(2);
    expect(w.sim.state.flags[`toasted:${w.me}`]).toBe(true);
  });
});

describe('investment: a share in the cider press', () => {
  function invest(seed: number) {
    const w = world(seed);
    w.go('brindle-farm');
    w.sim.modes.enter(w.me, 'INVEST');
    w.act({ kind: 'accept-contract', contractId: asId('contract_cider-press') });
    expect(w.coin()).toBe(20);
    const task = w.sim.contracts.get(asId('contract_cider-press'))!.taskIds[0]!;
    const early = w.sim.modes.perform(w.me, { kind: 'complete-task', taskId: task });
    expect(!early.ok && early.error.code).toBe('NOT_YET');
    w.clock.advance(60_000);
    const done = w.act({ kind: 'complete-task', taskId: task });
    const s = done.data!.settlement as { outcome: string; stakeReturned: number };
    expect(w.coin()).toBe(20 + s.stakeReturned);
    return s;
  }

  it('settles through the risk profile, deterministically per seed', () => {
    expect(invest(5)).toEqual(invest(5));
  });

  it('can lose the stake entirely, or pay off (risk without war)', () => {
    const outcomes = new Map<string, number>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = invest(seed);
      outcomes.set(s.outcome, s.stakeReturned);
    }
    expect(outcomes.get('failed')).toBe(0);
    expect(outcomes.get('modest')).toBe(25);
    expect([...outcomes.keys()].sort()).toEqual(['failed', 'modest', 'thrived']);
  });
});

describe('market fluctuation', () => {
  it('Quill’s prices drift on a schedule, deterministically, and the Realm remembers', () => {
    const run = (seed: number) => {
      const w = world(seed);
      const indices: number[] = [];
      for (let i = 0; i < 12; i++) {
        w.clock.advance(120_000);
        w.sim.tick(120_000);
        indices.push(w.sim.state.markets['market_quills-sundries']!.priceIndex);
      }
      return { indices, w };
    };
    const a = run(3);
    expect(run(3).indices).toEqual(a.indices);
    expect(new Set(a.indices).size).toBeGreaterThan(1);
    expect(a.w.sim.chronicle.realm().entries().some((e) => e.event === 'market.price-changed')).toBe(true);
    const oil = a.w.sim.market.quote(asId('market_quills-sundries'), asId('item_lantern-oil'), 1, 'buy');
    expect(oil.ok && oil.value.unitPrice).toBe(Math.round(6 * a.indices.at(-1)!));
  });
});

describe('property', () => {
  it('deeds are bought at the Keep gatehouse (civic office); the council is paid; ownership recorded', () => {
    const w = world();
    const r = w.sim.modes.perform(w.me, { kind: 'purchase-property', propertyId: asId('property_stall-4') });
    expect(!r.ok && r.error.code).toBe('NOT_PRESENT');
    w.go('blackmere-keep');
    const intents = w.sim.modes.available(w.me).filter((i) => i.kind === 'purchase-property');
    expect(intents).toHaveLength(2);
    w.act({ kind: 'purchase-property', propertyId: asId('property_stall-4') });
    expect(w.coin()).toBe(10);
    expect(w.sim.economy.balance({ kind: 'organization', id: asId('org_blackmere-council') }, MARK)).toBe(430);
    expect(w.sim.property.ownerOf(asId('property_stall-4'))).toEqual(w.self);
    expect(w.events()).toContain('property.purchased');
    expect(w.sim.authority.can(w.me, 'property.use', { kind: 'property', id: 'property_stall-4' })).toBe(true);
    const cottage = w.sim.modes.perform(w.me, { kind: 'purchase-property', propertyId: asId('property_wicket-cottage') });
    expect(!cottage.ok && cottage.error.code).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('money buys opportunity, not Canonical truth', () => {
  it('a full economic session leaves Canonical stores untouched and no score anywhere', () => {
    const w = world();
    w.go('blackmere-market');
    w.act({ kind: 'buy', marketId: asId('market_quills-sundries'), itemId: asId('item_lantern-oil'), quantity: 1 });
    w.go('blackmere-keep');
    w.act({ kind: 'purchase-property', propertyId: asId('property_stall-4') });
    expect(w.sim.state.canonical).toEqual({ derived: {}, recognitions: {} });
    expect(findForbiddenKeys(w.sim.state.persons)).toEqual([]);
    expect(Object.keys(w.sim.state.reputations).every((k) => !k.endsWith('@global:*'))).toBe(true);
    // Purchases are observed as raw interactions, but never verified or recognised by being paid for.
    const ev = Object.values(w.sim.state.evidence).filter((e) => e.actionType === 'property.purchased');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.verification).toBe('system-observed');
  });
});

describe('Peaceful property is never seized or destroyed', () => {
  it('involuntary property transfers are refused on the SAFE Blackmere server; voluntary ones work', () => {
    const w = world();
    w.go('blackmere-keep');
    w.act({ kind: 'purchase-property', propertyId: asId('property_stall-4') });
    const council = { kind: 'organization' as const, id: asId<'org'>('org_blackmere-council') };
    const seize = w.sim.ownership.transfer({ kind: 'property', id: 'property_stall-4' }, w.self, council, 'seizure', { involuntary: true });
    expect(!seize.ok && seize.error.code).toBe('PROPERTY_PROTECTED');
    expect(w.sim.property.ownerOf(asId('property_stall-4'))).toEqual(w.self);
    expect(w.sim.state.properties['property_stall-4']).toBeDefined(); // nothing can destroy it
    expect(w.sim.ownership.transfer({ kind: 'property', id: 'property_stall-4' }, w.self, council, 'gift').ok).toBe(true);
  });
});
