import { describe, expect, it } from 'vitest';
import canon from '../canon/canonical.json';
import { asId, provenance, type InteractionId, type PersonId } from '../src/core';
import {
  CANONICAL_CONCEPT_KEYS,
  CANONICAL_STAGES,
  IDENTITY_CONTEXTS,
  ORIENTATION_MIN_INTERACTIONS_FLOOR,
  buildGrandmeta,
  buildMetastrate,
  findForbiddenKeys,
  validateDerivedRecord,
  validateOrientation,
  validateRecognition,
  type CanonicalStage,
  type DerivedRecord,
  type Recognition,
} from '../src/identity';
import { ID, baker, makeSim, player } from './helpers/fixture';

const approved = { id: 'test-method', version: '0', approved: true };
const subject = asId<'person'>('person_wren') as PersonId;

function derived(over: Partial<DerivedRecord> = {}): DerivedRecord {
  return {
    id: 'd1',
    layer: 'derived',
    stage: 'MODALITIES',
    subject,
    derivedFrom: ['interaction_1'],
    method: approved,
    computedAt: 0,
    status: 'provisional',
    payload: {},
    provenance: provenance('derived', 'canonical', 0, { derivedFrom: ['interaction_1'] }),
    ...over,
  };
}

describe('canon data matches code', () => {
  it('pipeline, concepts, contexts and raw fields are identical', () => {
    expect([...CANONICAL_STAGES]).toEqual(canon.pipeline);
    expect([...CANONICAL_CONCEPT_KEYS]).toEqual(canon.concepts.map((c) => c.key));
    expect([...IDENTITY_CONTEXTS]).toEqual(canon.identityContexts);
    expect(ORIENTATION_MIN_INTERACTIONS_FLOOR).toBe(canon.rules.orientationMinDistinctInteractionsFloor);
    expect(canon.concepts.filter((c) => c.status === 'reserved').every((c) => c.definition === null)).toBe(true);
    expect(canon.rules.universalHumanRank).toBe(false);
  });
});

describe('raw evidence', () => {
  it('stores exactly the raw fields, separate from interpretation', () => {
    const { sim } = makeSim();
    const { interaction, evidence } = sim.interactions.record({ actor: ID.player, actionType: 'talk', target: { kind: 'actor', id: ID.baker }, location: ID.square, outcome: 'greeted' });
    expect(evidence.interactionId).toBe(interaction.id);
    for (const f of canon.rawEvidenceFields) expect(evidence, f).toHaveProperty(f);
    expect(evidence.layer).toBe('observed');
    expect(evidence.verification).toBe('system-observed');
    // Nothing derived ever lands in the raw store.
    expect(findForbiddenKeys(sim.state.evidence)).toEqual([]);
    expect(sim.state.canonical.derived).toEqual({});
  });

  it('meaningful actor events automatically become raw interactions', () => {
    const { sim } = makeSim();
    sim.market.buy(player, ID.market, ID.bread, 1);
    sim.world.travel(ID.player, ID.farm);
    const kinds = sim.interactions.byActor(ID.player).map((i) => i.actionType);
    expect(kinds).toEqual(expect.arrayContaining(['market.purchase', 'location.discovered']));
  });

  it('verification follows strict transitions; no self-verification; no economic source', () => {
    const { sim } = makeSim();
    const { evidence } = sim.interactions.record({ actor: ID.player, actionType: 'help', verification: 'unverified' });
    expect(sim.interactions.verify(evidence.id, 'witnessed', { kind: 'witness', id: ID.player }).ok).toBe(false); // self
    expect(sim.interactions.verify(evidence.id, 'verified', { kind: 'witness', id: ID.baker }).ok).toBe(false); // witness can't verify
    expect(sim.interactions.verify(evidence.id, 'verified', { kind: 'payment', id: 'market' } as never).ok).toBe(false);
    expect(sim.interactions.verify(evidence.id, 'witnessed', { kind: 'witness', id: ID.baker }).ok).toBe(true);
    expect(sim.interactions.verify(evidence.id, 'verified', { kind: 'authorized-verifier', id: 'registrar' }).ok).toBe(true);
    expect(sim.interactions.verify(evidence.id, 'witnessed', { kind: 'witness', id: ID.baker }).ok).toBe(false); // no downgrade
    expect(sim.state.evidence[evidence.id]!.verificationHistory.map((h) => h.to)).toEqual(['witnessed', 'verified']);
  });
});

describe('identity contexts', () => {
  function setup() {
    const f = makeSim();
    const person = f.sim.identity.createPerson('Wren', subject);
    f.state.actors[ID.player]!.personId = person.id;
    person.actors[ID.realm] = ID.player;
    return { ...f, person };
  }

  it('creates a universal identity and keeps contexts separate', () => {
    const { sim, person } = setup();
    const universal = sim.identity.identitiesOf(person.id).find((i) => i.context === 'UNIVERSAL')!;
    const work = sim.identity.createIdentity(person.id, 'WORK', { displayName: 'W. Ashdown' });
    const realm = sim.identity.createIdentity(person.id, 'REALM', { displayName: 'Wren of Testland', realmId: ID.realm });
    if (!work.ok || !realm.ok) throw new Error('setup failed');
    expect(sim.identity.createIdentity(person.id, 'WORK', { displayName: 'dup' }).ok).toBe(false);
    expect(sim.identity.createIdentity(person.id, 'REALM', { displayName: 'no realm' }).ok).toBe(false);
    // Separate by default, even for the same person.
    expect(sim.identity.canView(work.value.id, realm.value.id)).toBe(false);
    expect(sim.identity.canView(realm.value.id, universal.id)).toBe(false);
    // Explicit, revocable consent.
    sim.identity.link(work.value.id, realm.value.id);
    expect(sim.identity.canView(work.value.id, realm.value.id)).toBe(true);
    expect(sim.identity.canView(realm.value.id, work.value.id)).toBe(false);
    sim.identity.unlink(work.value.id, realm.value.id);
    expect(sim.identity.canView(work.value.id, realm.value.id)).toBe(false);
  });

  it('declared claims stay in the declared layer and never become evidence', () => {
    const { sim, person } = setup();
    const id = sim.identity.identitiesOf(person.id)[0]!.id;
    const claim = sim.identity.declare(id, 'trade', 'master baker');
    expect(claim.ok && claim.value.layer).toBe('declared');
    expect(Object.values(sim.state.evidence).some((e) => e.actionType === 'identity.declared')).toBe(false);
  });

  it('persons and identities carry no score or rank fields', () => {
    const { sim } = setup();
    expect(findForbiddenKeys(sim.state.persons)).toEqual([]);
    expect(findForbiddenKeys(sim.state.identities)).toEqual([]);
  });
});

describe('Canonical pipeline guards', () => {
  const stages: Record<string, CanonicalStage> = { interaction_1: 'INTERACTION', interaction_2: 'INTERACTION', m1: 'MODALITIES', sig: 'SIGNATURE' };
  const lookup = (id: string) => stages[id];

  it('accepts a well-formed, approved, properly sourced record', () => {
    expect(validateDerivedRecord(derived(), lookup).ok).toBe(true);
  });

  it.each([
    ['unapproved method', { method: { ...approved, approved: false } }, 'UNAPPROVED_METHOD'],
    ['no basis', { derivedFrom: [] }, 'NO_BASIS'],
    ['skipped stage', { stage: 'POLARITIES' as const }, 'STAGE_SKIP'],
    ['unknown input', { derivedFrom: ['ghost'] }, 'UNKNOWN_INPUT'],
    ['non-derived provenance', { provenance: provenance('system', 'canonical', 0) }, 'BAD_PROVENANCE'],
    ['economic author', { provenance: provenance('derived', 'market', 0, { derivedFrom: ['x'] }) }, 'ECONOMIC_SOURCE'],
    ['score in payload', { payload: { nested: { humanScore: 9 } } }, 'FORBIDDEN_FIELD'],
    ['rank in payload', { payload: { Rank: 'A' } }, 'FORBIDDEN_FIELD'],
    ['job suitability', { payload: { job_suitability: 'high' } }, 'FORBIDDEN_FIELD'],
  ])('rejects %s', (_label, over, code) => {
    const r = validateDerivedRecord(derived(over as Partial<DerivedRecord>), lookup);
    expect(!r.ok && r.error.code).toBe(code);
  });

  it('never assigns an Orientation from one interaction, whatever the policy says', () => {
    const one = { subject, orientation: 'reserved', basis: ['i1' as InteractionId], derivedFrom: ['s'], method: approved, assignedAt: 0 };
    expect(validateOrientation(one, { minDistinctInteractions: 0 }).ok).toBe(false);
    expect(validateOrientation({ ...one, basis: ['i1', 'i1'] as InteractionId[] }, { minDistinctInteractions: 1 }).ok).toBe(false);
    expect(validateOrientation({ ...one, basis: ['i1', 'i2'] as InteractionId[] }, { minDistinctInteractions: 1 }).ok).toBe(true);
    expect(validateOrientation({ ...one, basis: ['i1', 'i2'] as InteractionId[] }, { minDistinctInteractions: 5 }).ok).toBe(false);
  });

  it('Recognition needs a Signature and an authorized, non-economic, non-self verifier', () => {
    const sig = derived({ id: 'sig', stage: 'SIGNATURE', derivedFrom: ['a'] });
    const r: Recognition = { id: 'r1', layer: 'recognized', subject, signatureRecordId: 'sig', verifiedBy: { kind: 'authorized-verifier', id: 'registrar' }, verifiedAt: 0, status: 'active', visibleIn: [] };
    expect(validateRecognition(r, sig).ok).toBe(true);
    expect(validateRecognition(r, undefined).ok).toBe(false);
    expect(validateRecognition(r, derived()).ok).toBe(false);
    expect(validateRecognition({ ...r, verifiedBy: { kind: 'witness', id: 'x' } }, sig).ok).toBe(false);
    expect(validateRecognition({ ...r, verifiedBy: { kind: 'authorized-verifier', id: subject } }, sig).ok).toBe(false);
    expect(validateRecognition({ ...r, verifiedBy: { kind: 'authorized-verifier', id: 'economy' } }, sig).ok).toBe(false);
  });
});

describe('Metastrate and Grandmeta (raw indexes only)', () => {
  it('Metastrate indexes one person’s evidence across their actors, privately, with no scores', () => {
    const { sim, state } = makeSim();
    const person = sim.identity.createPerson('Wren', subject);
    person.actors[ID.realm] = ID.player;
    sim.interactions.record({ actor: ID.player, actionType: 'talk' });
    sim.interactions.record({ actor: ID.player, actionType: 'talk' });
    sim.interactions.record({ actor: ID.baker, actionType: 'bake' });
    const m = buildMetastrate(person, Object.values(state.evidence), 0);
    expect(m.visibility).toBe('private');
    expect(m.evidenceIds).toHaveLength(2);
    expect(m.evidenceByActionType).toEqual({ talk: 2 });
    expect(findForbiddenKeys(m)).toEqual([]);
  });

  it('Grandmeta includes only realm/public history, never private entries', () => {
    const { sim, state } = makeSim();
    sim.market.buy(player, ID.market, ID.bread, 1); // private purchase
    sim.market.setPriceIndex(ID.market, 1.2, 'festival'); // realm-visible
    const g = buildGrandmeta(ID.realm, state.chronicle, 0);
    expect(Object.keys(g.entriesByEvent)).toEqual(['market.price-changed']);
    expect(findForbiddenKeys(g)).toEqual([]);
  });
});

describe('economic loop cannot touch Canonical state', () => {
  it('a full round of economic activity leaves derived/recognition stores empty', () => {
    const { sim } = makeSim();
    sim.market.buy(player, ID.market, ID.bread, 3);
    sim.economy.transfer(player, baker, ID.coin, 10, { reason: 'tip' });
    sim.property.ownerOf('property_x' as never);
    expect(sim.state.canonical).toEqual({ derived: {}, recognitions: {} });
  });
});
