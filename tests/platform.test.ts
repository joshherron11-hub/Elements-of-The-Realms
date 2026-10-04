import { describe, expect, it } from 'vitest';
import { asId, provenance, type OrganizationId } from '../src/core';
import { findForbiddenKeys } from '../src/identity';
import { ID, baker, makeSim, player } from './helpers/fixture';

/**
 * Learn, Work and Create are not products yet. These tests show that each
 * can be expressed with the shared kernel — organizations, contracts, tasks,
 * artifacts, contributions, evidence, ownership and the Chronicle — without
 * any new systems.
 */
describe('WORK — a project on the shared kernel', () => {
  it('team + commission contract + tasks + artifact + contributions + Professional Chronicle', () => {
    const { sim, state } = makeSim();
    const team = asId<'org'>('org_bakery-team') as OrganizationId;
    state.organizations[team] = { id: team, kind: 'team', name: 'Bakery Signage Project', domain: 'WORK', members: {}, tags: [], provenance: provenance('system', 't', 0) };
    sim.organizations.join(ID.player, team);
    const c = sim.contracts.offer({
      kind: 'commission', title: 'Paint the bakery sign', description: '', domain: 'WORK', issuer: baker,
      tasks: [{ title: 'Deliver the design', requirement: { kind: 'custom', key: 'design-delivered' } }],
      terms: { rewards: [{ kind: 'currency', currencyId: ID.coin, amount: 30 }], penalties: [] },
    });
    sim.contracts.accept(c.id, player);
    const art = sim.artifacts.create({ kind: 'design', title: 'Bakery sign, draft 1', domain: 'WORK', author: ID.player });
    if (!art.ok) throw new Error(art.error.message);
    sim.artifacts.contribute(ID.baker, { kind: 'artifact', id: art.value.id }, 'reviewer', 'WORK', 'more gold leaf');
    sim.artifacts.setStatus(art.value.id, 'accepted', ID.baker);
    sim.contracts.completeTask(c.taskIds[0]!, ID.player);

    expect(sim.ownership.ownerOf({ kind: 'artifact', id: art.value.id })).toEqual(player);
    expect(sim.state.artifacts[art.value.id]!.contributors).toEqual([ID.player, ID.baker]);
    expect(sim.artifacts.contributionsBy(ID.player, 'WORK').map((x) => x.role)).toEqual(['author']);
    const pro = sim.chronicle.professional(ID.player).entries().map((e) => e.event);
    expect(pro).toEqual(expect.arrayContaining(['organization.joined', 'contract.accepted', 'artifact.created', 'contract.completed']));
    // Play history does not leak into the Professional Chronicle.
    sim.world.travel(ID.player, ID.farm);
    expect(sim.chronicle.professional(ID.player).entries().some((e) => e.event === 'location.discovered')).toBe(false);
    expect(sim.economy.balance(player, ID.coin)).toBe(130);
  });
});

describe('LEARN — a course on the shared kernel', () => {
  it('school + course + practice + submitted coursework + teacher-verified evidence + Learning Chronicle', () => {
    const { sim, state } = makeSim();
    const school = asId<'org'>('org_mere-school') as OrganizationId;
    state.organizations[school] = { id: school, kind: 'school', name: 'The Mere School', domain: 'LEARN', members: {}, tags: [], provenance: provenance('system', 't', 0) };
    sim.organizations.join(ID.player, school);
    const course = sim.contracts.offer({
      kind: 'course', title: 'Reading the Ledger', description: '', domain: 'LEARN', issuer: { kind: 'organization', id: school },
      tasks: [
        { title: 'Practice: balance three ledgers', requirement: { kind: 'custom', key: 'practice' } },
        { title: 'Submit coursework', requirement: { kind: 'custom', key: 'coursework' } },
      ],
      terms: { rewards: [], penalties: [] },
    });
    sim.contracts.accept(course.id, player);
    const work = sim.artifacts.create({ kind: 'coursework', title: 'My balanced ledgers', domain: 'LEARN', author: ID.player });
    if (!work.ok) throw new Error(work.error.message);
    sim.artifacts.setStatus(work.value.id, 'submitted', ID.player);
    for (const t of course.taskIds) sim.contracts.completeTask(t, ID.player);

    // Assessment = raw evidence of the submission, verified by an authorized teacher — not a score.
    const ev = Object.values(sim.state.evidence).find((e) => e.actionType === 'artifact.status-changed' && e.actor === ID.player)!;
    expect(ev).toBeDefined();
    expect(sim.interactions.verify(ev.id, 'verified', { kind: 'authorized-verifier', id: 'teacher_odo' }).ok).toBe(true);
    expect(sim.state.evidence[ev.id]!.verification).toBe('verified');

    const learning = sim.chronicle.domain(ID.player, 'LEARN').entries().map((e) => e.event);
    expect(learning).toEqual(expect.arrayContaining(['organization.joined', 'contract.accepted', 'artifact.created', 'artifact.status-changed', 'contract.completed']));
    expect(findForbiddenKeys(sim.state.artifacts)).toEqual([]);
    expect(findForbiddenKeys(sim.state.contributions)).toEqual([]);
  });
});

describe('CREATE — owned, attributed creations', () => {
  it('a creation is an owned asset with provenance; ownership can move; authorship stays', () => {
    const { sim } = makeSim();
    const map = sim.artifacts.create({ kind: 'world', title: 'A map of Hollowmere', domain: 'CREATE', author: ID.player, content: { hash: 'abc123' } });
    if (!map.ok) throw new Error(map.error.message);
    expect(map.value.provenance).toMatchObject({ origin: 'actor', sourceSystem: 'artifacts' });
    sim.economy.transfer(baker, player, ID.coin, 25, { reason: 'bought a map' });
    sim.ownership.transfer({ kind: 'artifact', id: map.value.id }, player, baker, 'sale');
    expect(sim.ownership.ownerOf({ kind: 'artifact', id: map.value.id })).toEqual(baker);
    expect(sim.state.artifacts[map.value.id]!.createdBy).toEqual(player); // money moves the asset, never the authorship
    const creator = sim.chronicle.domain(ID.player, 'CREATE').entries();
    expect(creator.map((e) => e.event)).toContain('artifact.created');
    sim.reputation.adjust(player, { kind: 'organization', id: 'org_creators' }, 3, 'well-received map');
    expect(sim.reputation.standingsOf(player)).toHaveLength(1);
  });

  it('artifacts survive save/load like everything else', () => {
    const { sim } = makeSim();
    sim.artifacts.create({ kind: 'document', title: 'Notes', domain: 'CREATE', author: ID.player });
    const copy = JSON.parse(JSON.stringify(sim.state));
    expect(copy.artifacts).toEqual(sim.state.artifacts);
    expect(copy.contributions).toEqual(sim.state.contributions);
  });
});
