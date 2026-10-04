import { describe, expect, it } from 'vitest';
import canon from '../canon/canonical.json';
import { asId, provenance, type InteractionId, type PersonId } from '../src/core';
import {
  CANONICAL_CONCEPT_KEYS,
  CANONICAL_STAGES,
  DEFAULT_CANON_CONFIG,
  IDENTITY_CONTEXTS,
  RECOGNITION_LADDER,
  TEST_ONLY_CANON_CONFIG,
  TEST_ONLY_INTERPRETATION,
  TEST_ONLY_RECOGNITION_THRESHOLDS,
  assessLadder,
  buildGrandmeta,
  type LadderEvidence,
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
    expect([...RECOGNITION_LADDER]).toEqual(canon.recognitionLadder);
    expect(canon.thresholds.status).toBe('UNFINALIZED');
    expect(canon.thresholds.productionInterpretationEnabled).toBe(false);
    expect(canon.verifierRoles).toMatchObject({ status: 'UNFINALIZED', roles: [] });
    expect(canon.rules.autoAssignOrientation).toBe(false);
    expect(canon.rules).not.toHaveProperty('orientationMinDistinctInteractionsFloor');
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

  it('by default nothing can be marked verified: authorized verifier roles are unfinalized', () => {
    const { sim } = makeSim();
    const { evidence } = sim.interactions.record({ actor: ID.player, actionType: 'help', verification: 'unverified' });
    const r = sim.interactions.verify(evidence.id, 'verified', { kind: 'authorized-verifier', id: 'registrar', role: 'registrar' });
    expect(!r.ok && r.error.code).toBe('VERIFIER_ROLES_UNFINALIZED');
    expect(sim.interactions.verify(evidence.id, 'witnessed', { kind: 'witness', id: ID.baker }).ok).toBe(true);
  });

  it('TEST_ONLY verifier roles never work outside tests', () => {
    const { sim } = makeSim(7, { ...TEST_ONLY_CANON_CONFIG, environment: 'production' });
    const { evidence } = sim.interactions.record({ actor: ID.player, actionType: 'help', verification: 'unverified' });
    const r = sim.interactions.verify(evidence.id, 'verified', { kind: 'authorized-verifier', id: 'x', role: 'test-verifier' });
    expect(!r.ok && r.error.code).toBe('TEST_ONLY_POLICY');
  });

  it('verification follows strict transitions; no self-verification; no economic source', () => {
    const { sim } = makeSim(7, TEST_ONLY_CANON_CONFIG);
    const { evidence } = sim.interactions.record({ actor: ID.player, actionType: 'help', verification: 'unverified' });
    expect(sim.interactions.verify(evidence.id, 'witnessed', { kind: 'witness', id: ID.player }).ok).toBe(false); // self
    expect(sim.interactions.verify(evidence.id, 'verified', { kind: 'witness', id: ID.baker }).ok).toBe(false); // witness can't verify
    expect(sim.interactions.verify(evidence.id, 'verified', { kind: 'payment', id: 'market' } as never).ok).toBe(false);
    expect(sim.interactions.verify(evidence.id, 'witnessed', { kind: 'witness', id: ID.baker }).ok).toBe(true);
    expect(sim.interactions.verify(evidence.id, 'verified', { kind: 'authorized-verifier', id: 'registrar', role: 'not-a-role' }).ok).toBe(false);
    expect(sim.interactions.verify(evidence.id, 'verified', { kind: 'authorized-verifier', id: 'registrar', role: 'test-registrar' }).ok).toBe(true);
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

  it('refuses everything while Canonical interpretation is disabled (the production default)', () => {
    const r = validateDerivedRecord(derived(), lookup);
    expect(!r.ok && r.error.code).toBe('INTERPRETATION_DISABLED');
    const prod = validateDerivedRecord(derived(), lookup, TEST_ONLY_INTERPRETATION, 'production');
    expect(!prod.ok && prod.error.code).toBe('TEST_ONLY_POLICY');
    const provisional = { enabled: true, policy: { ...TEST_ONLY_RECOGNITION_THRESHOLDS, status: 'PROVISIONAL' as const } };
    expect(validateDerivedRecord(derived(), lookup, provisional, 'production').ok).toBe(false);
    expect(validateDerivedRecord(derived(), lookup, provisional, 'development').ok).toBe(true);
  });

  it('accepts a well-formed, approved, properly sourced record (TEST_ONLY config)', () => {
    expect(validateDerivedRecord(derived(), lookup, TEST_ONLY_INTERPRETATION, 'test').ok).toBe(true);
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
    const r = validateDerivedRecord(derived(over as Partial<DerivedRecord>), lookup, TEST_ONLY_INTERPRETATION, 'test');
    expect(!r.ok && r.error.code).toBe(code);
  });

  const ev = (id: string, actionType: string, ctx: string, identity: string, at: number, verification: LadderEvidence['verification'] = 'witnessed'): LadderEvidence =>
    ({ interactionId: id, actionType, contextKey: ctx, identityContext: identity, verification, at });
  const strong: LadderEvidence[] = [
    ev('i1', 'help', 'hf|PLAY', 'realm', 0),
    ev('i2', 'help', 'hf|PLAY', 'realm', 500),
    ev('i3', 'help', 'hf|WORK', 'work', 1000),
    ev('i4', 'teach', 'hf|LEARN', 'learning', 1500),
  ];
  const proposal = (basis: string[], assignedBy: { kind: 'review'; reviewer: string } | { kind: 'automatic' } = { kind: 'review', reviewer: 'test-reviewer' }) => ({
    subject, orientation: 'reserved', basis: basis as InteractionId[], derivedFrom: ['s'], method: approved, assignedBy, assignedAt: 0,
  });

  it('the Recognition ladder is configurable and grants nothing on its own', () => {
    expect(assessLadder(strong, DEFAULT_CANON_CONFIG.interpretation, 'production').ok).toBe(false);
    const a = assessLadder(strong, TEST_ONLY_INTERPRETATION, 'test');
    expect(a.ok && a.value).toMatchObject({ level: 'STABLE', eligibleForRecognitionReview: false, policy: { status: 'TEST_ONLY' } });
    const one = assessLadder([ev('i1', 'help', 'hf|PLAY', 'realm', 0)], TEST_ONLY_INTERPRETATION, 'test');
    expect(one.ok && one.value.level).toBe('OBSERVED');
    const sameContext = assessLadder([ev('a', 'help', 'c', 'realm', 0), ev('b', 'help', 'c', 'realm', 1), ev('c', 'help', 'c', 'realm', 2)], TEST_ONLY_INTERPRETATION, 'test');
    expect(sameContext.ok && sameContext.value.level).toBe('REPEATED'); // no cross-context evidence → stops
    const weak = assessLadder(strong.map((e) => ({ ...e, verification: 'unverified' as const })), TEST_ONLY_INTERPRETATION, 'test');
    expect(weak.ok && weak.value.level).toBe('FIRST_READ'); // verification quality matters
    // Thresholds are data, per stage: a stricter policy changes the outcome without code changes.
    const strict = { enabled: true, policy: { ...TEST_ONLY_RECOGNITION_THRESHOLDS, stages: { ...TEST_ONLY_RECOGNITION_THRESHOLDS.stages, REPEATED: { ...TEST_ONLY_RECOGNITION_THRESHOLDS.stages.REPEATED, minRepetitions: 10 } } } };
    const s2 = assessLadder(strong, strict, 'test');
    expect(s2.ok && s2.value.level).toBe('OBSERVED');
  });

  it('Orientation: never automatic, never from one interaction, never without enough evidence, never when disabled', () => {
    const cfg = TEST_ONLY_INTERPRETATION;
    expect(validateOrientation(proposal(['i1', 'i2', 'i3', 'i4']), strong).ok).toBe(false); // disabled by default
    expect(validateOrientation(proposal(['i1', 'i2', 'i3', 'i4']), strong, cfg, 'production').ok).toBe(false); // TEST_ONLY outside tests
    const auto = validateOrientation(proposal(['i1', 'i2', 'i3', 'i4'], { kind: 'automatic' }), strong, cfg, 'test');
    expect(!auto.ok && auto.error.code).toBe('AUTOMATIC_ORIENTATION');
    const single = validateOrientation(proposal(['i1']), strong, cfg, 'test');
    expect(!single.ok && single.error.code).toBe('SINGLE_INTERACTION');
    const thin = validateOrientation(proposal(['i1', 'i2']), strong, cfg, 'test');
    expect(!thin.ok && thin.error.code).toBe('INSUFFICIENT_BASIS'); // two interactions is NOT a threshold
    expect(validateOrientation(proposal(['i1', 'i2', 'i3', 'i4']), strong, cfg, 'test').ok).toBe(true);
  });

  it('Recognition needs a Signature and an authorized, non-economic, non-self verifier', () => {
    const sig = derived({ id: 'sig', stage: 'SIGNATURE', derivedFrom: ['a'] });
    const r: Recognition = { id: 'r1', layer: 'recognized', subject, signatureRecordId: 'sig', verifiedBy: { kind: 'authorized-verifier', id: 'registrar', role: 'test-registrar' }, verifiedAt: 0, status: 'active', visibleIn: [] };
    const T = TEST_ONLY_CANON_CONFIG;
    const off = validateRecognition(r, sig);
    expect(!off.ok && off.error.code).toBe('INTERPRETATION_DISABLED');
    expect(validateRecognition(r, sig, T).ok).toBe(true);
    expect(validateRecognition(r, undefined, T).ok).toBe(false);
    expect(validateRecognition(r, derived(), T).ok).toBe(false);
    expect(validateRecognition({ ...r, verifiedBy: { kind: 'witness', id: 'x' } }, sig, T).ok).toBe(false);
    expect(validateRecognition({ ...r, verifiedBy: { kind: 'authorized-verifier', id: 'x', role: 'mayor' } }, sig, T).ok).toBe(false);
    expect(validateRecognition({ ...r, verifiedBy: { kind: 'authorized-verifier', id: subject, role: 'test-registrar' } }, sig, T).ok).toBe(false);
    expect(validateRecognition({ ...r, verifiedBy: { kind: 'authorized-verifier', id: 'economy', role: 'test-registrar' } }, sig, T).ok).toBe(false);
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

describe('no universal human value; scoped measures allowed', () => {
  it('bans universal-value concepts everywhere and bare score/rank fields on Canonical records', async () => {
    const { findForbiddenKeys: f, isUniversalValueName } = await import('../src/identity');
    for (const k of ['humanScore', 'overall_rank', 'playerSuperiority', 'orientationQuality', 'elementSuperiority', 'employabilityScore', 'educationWorth', 'socialCreditScore']) {
      expect(isUniversalValueName(k), k).toBe(true);
      expect(f({ [k]: 1 }, 'universal'), k).toEqual([k]);
    }
    expect(f({ rank: 3 })).toEqual(['rank']); // canonical records: no bare rank
    expect(f({ rank: 3 }, 'universal')).toEqual([]); // a scoped measure may call itself a rank
  });

  it('contextual measures must be scoped and can never become universal', async () => {
    const { validateMeasure } = await import('../src/entities');
    const { isUniversalValueName } = await import('../src/identity');
    const base = { id: 'm1', subject: { kind: 'actor' as const, id: ID.player }, metric: 'tournament-rank', value: 3, at: 0 };
    expect(validateMeasure({ ...base, context: { kind: 'tournament', id: 'harvest-cup-1' } }, isUniversalValueName).ok).toBe(true);
    expect(validateMeasure({ ...base, context: { kind: 'skill', id: 'cider-pressing' }, metric: 'barrels-pressed' }, isUniversalValueName).ok).toBe(true);
    expect(validateMeasure({ ...base, context: { kind: 'tournament', id: '' } }, isUniversalValueName).ok).toBe(false);
    expect(validateMeasure({ ...base, context: { kind: 'global' as never, id: 'x' } }, isUniversalValueName).ok).toBe(false);
    expect(validateMeasure({ ...base, context: { kind: 'skill', id: 'overall' } }, isUniversalValueName).ok).toBe(false);
    expect(validateMeasure({ ...base, context: { kind: 'economic', id: 'blackmere-market' }, metric: 'humanScore' }, isUniversalValueName).ok).toBe(false);
    expect(validateMeasure({ ...base, context: { kind: 'duel', id: 'season-1' }, metric: 'overall-human-rank' }, isUniversalValueName).ok).toBe(false);
  });
});
