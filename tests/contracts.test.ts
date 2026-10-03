import { describe, expect, it } from 'vitest';
import { ID, baker, farmer, makeSim, player } from './helpers/fixture';

const townScope = { kind: 'location' as const, id: ID.town };

function deliveryContract(sim: ReturnType<typeof makeSim>['sim'], reward = 15) {
  sim.inventory.add(baker, ID.parcel, 1);
  return sim.contracts.offer({
    kind: 'delivery',
    title: 'Bread for the farm',
    description: 'Take a parcel to Hale.',
    issuer: baker,
    tasks: [
      { title: 'Collect the parcel', requirement: { kind: 'acquire', itemId: ID.parcel, quantity: 1 } },
      { title: 'Deliver to Hale', requirement: { kind: 'deliver', itemId: ID.parcel, quantity: 1, to: ID.farmer } },
    ],
    terms: {
      rewards: [
        { kind: 'currency', currencyId: ID.coin, amount: reward },
        { kind: 'reputation', scope: townScope, amount: 5 },
        { kind: 'relationship', with: ID.baker, regard: 10, trust: 5 },
      ],
      penalties: [{ kind: 'reputation', scope: townScope, amount: 3 }],
    },
  });
}

describe('ContractService', () => {
  it('runs a delivery contract end to end and pays rewards', () => {
    const { sim } = makeSim();
    const c = deliveryContract(sim);
    expect(sim.contracts.accept(c.id, player).ok).toBe(true);
    sim.inventory.move(baker, player, ID.parcel, 1); // handed over
    const [collect, deliver] = c.taskIds;

    expect(sim.contracts.completeTask(collect!, ID.player).ok).toBe(true);
    // Not at the farm yet.
    const notThere = sim.contracts.completeTask(deliver!, ID.player);
    expect(!notThere.ok && notThere.error.code).toBe('NOT_PRESENT');

    sim.world.travel(ID.player, ID.farm);
    const done = sim.contracts.completeTask(deliver!, ID.player);
    expect(done.ok && done.value.settlement?.outcome).toBe('completed');
    expect(sim.contracts.get(c.id)!.status).toBe('completed');
    expect(sim.inventory.count(farmer, ID.parcel)).toBe(1);
    expect(sim.economy.balance(player, ID.coin)).toBe(115);
    expect(sim.reputation.get(player, townScope)).toBe(5);
    expect(sim.relationships.get(ID.baker, ID.player)).toMatchObject({ regard: 10, trust: 5 });
    expect(sim.chronicle.personal(ID.player).entries().map((e) => e.event)).toEqual(
      expect.arrayContaining(['contract.accepted', 'contract.completed']),
    );
  });

  it('only the holder may complete tasks; issuer cannot accept own contract', () => {
    const { sim } = makeSim();
    const c = deliveryContract(sim);
    expect(sim.contracts.accept(c.id, baker).ok).toBe(false);
    sim.contracts.accept(c.id, player);
    const r = sim.contracts.completeTask(c.taskIds[0]!, ID.farmer);
    expect(!r.ok && r.error.code).toBe('NOT_HOLDER');
  });

  it('fails with issuer-default when the issuer cannot pay (non-combat risk)', () => {
    const { sim } = makeSim();
    const c = deliveryContract(sim, 10_000);
    sim.contracts.accept(c.id, player);
    sim.inventory.move(baker, player, ID.parcel, 1);
    sim.contracts.completeTask(c.taskIds[0]!, ID.player);
    sim.world.travel(ID.player, ID.farm);
    const r = sim.contracts.completeTask(c.taskIds[1]!, ID.player);
    expect(r.ok && r.value.settlement?.outcome).toBe('issuer-default');
    expect(sim.contracts.get(c.id)!.status).toBe('failed');
    expect(sim.economy.balance(player, ID.coin)).toBe(100);
  });

  it('fails on deadline and applies penalties', () => {
    const { sim, clock } = makeSim();
    const c = deliveryContract(sim);
    c.deadline = clock.now() + 1000;
    sim.contracts.accept(c.id, player);
    clock.advance(2000);
    sim.tick(2000);
    expect(sim.contracts.get(c.id)).toMatchObject({ status: 'failed', outcome: 'deadline-missed' });
    expect(sim.reputation.get(player, townScope)).toBe(-3);
  });

  it('settles an investment stake through risk, deterministically and ledgered', () => {
    const run = (seed: number) => {
      const { sim } = makeSim(seed);
      const c = sim.contracts.offer({
        kind: 'investment',
        title: 'Back the mill',
        description: 'Stake coin in the mill.',
        issuer: farmer,
        tasks: [{ title: 'Wait for the season', requirement: { kind: 'custom', key: 'season-ends' } }],
        terms: { rewards: [], penalties: [], stake: { currencyId: ID.coin, amount: 40 }, riskProfileId: ID.venture },
      });
      expect(sim.contracts.accept(c.id, player).ok).toBe(true);
      expect(sim.economy.balance(player, ID.coin)).toBe(60);
      const r = sim.contracts.completeTask(c.taskIds[0]!, ID.player);
      if (!r.ok) throw new Error(r.error.message);
      return { outcome: r.value.settlement!.outcome, returned: r.value.settlement!.stakeReturned, balance: sim.economy.balance(player, ID.coin) };
    };
    const a = run(1);
    expect(run(1)).toEqual(a);
    expect(a.balance).toBe(60 + (a.returned ?? 0));
    expect(['loss', 'gain']).toContain(a.outcome);
    // Over many seeds both outcomes occur.
    const outcomes = new Set(Array.from({ length: 20 }, (_, i) => run(i + 1).outcome));
    expect(outcomes).toEqual(new Set(['loss', 'gain']));
  });

  it('rejects accepting a stake the holder cannot afford', () => {
    const { sim } = makeSim();
    const c = sim.contracts.offer({
      kind: 'investment', title: 'Too rich', description: '', issuer: farmer,
      tasks: [], terms: { rewards: [], penalties: [], stake: { currencyId: ID.coin, amount: 999 } },
    });
    expect(sim.contracts.accept(c.id, player).ok).toBe(false);
    expect(sim.contracts.get(c.id)!.status).toBe('offered');
  });
});
