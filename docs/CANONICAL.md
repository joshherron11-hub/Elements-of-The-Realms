# Canonical & Identity Architecture

Status: **structure only**. No Canonical interpretation is implemented. Only raw
evidence is collected. Reference data lives in `canon/canonical.json`; changing it
changes Canon.

## Three layers that never merge

| Layer | What it is | Where | Who writes it |
|---|---|---|---|
| `declared` | What a person says about themself | `Identity`, `DeclaredClaim` (`state.claims`) | the person |
| `observed` | Raw evidence of what happened | `Interaction`, `Evidence` (`state.interactions`, `state.evidence`) | the kernel (system-observed), witnesses, authorized verifiers |
| `derived` / `recognized` | Canonical interpretation and verified Recognition | `state.canonical.derived`, `state.canonical.recognitions` | **nobody yet**, reserved until Canon defines methods |

Every record carries its `layer`, so the layers can't be mixed up silently.

## Raw evidence fields
`actor · target · time · location · context · actionType · outcome · provenance · verification`

Any chronicle-worthy event that names an actor automatically becomes a raw
interaction plus evidence (`InteractionService.attach`). The event type is the action
type, and nothing is interpreted.

### Verification
`unverified → system-observed → witnessed → verified`, and anything can become `disputed`.
- Only an `authorized-verifier` can mark evidence `verified`.
- A `witness` can only raise evidence to `witnessed`.
- Nobody can witness or verify their own evidence.
- There is no payment or economic verification source.
- The history is append-only.

## Pipeline (reserved)
`INTERACTION → MODALITIES → CONSTITUENCIES → DICHOTOMIES → POLARITIES → AFFINITY → SIGNATURE → RECOGNITION`

`DerivedRecord` reserves the storage shape. `validateDerivedRecord` enforces:
- an approved derivation method (approval belongs to the Canon owner),
- non-empty `derivedFrom`, drawn only from the immediately preceding stage,
- `derived` provenance, never authored by an economic system,
- no `score`, `rank`, `rating`, `worth`, `suitability`, `iq`, `percentile` (or similar)
  keys anywhere in the payload.

`CanonicalDeriver` is the plug-in interface. No implementations exist.

## Recognition thresholds: NOT finalized
Canonical Recognition thresholds are **not finalized**. There is no Canonical
threshold anywhere in this codebase.

**Recognition ladder:**
`FIRST READ → OBSERVED → REPEATED → CROSS-CONTEXT → STABLE → RECOGNITION`
(`src/identity/canonical/ladder.ts`).

**Thresholds are configuration** (`RecognitionThresholdPolicy`). They are set per stage
and can depend on:
- distinct interactions;
- repetition of the same kind of action;
- context diversity;
- minimum verification quality;
- cross-context evidence;
- time span.

**Each policy has a status:**
- **TEST_ONLY:** fixtures for exercising the software, refused outside tests. The
  only numbers in the repo are `TEST_ONLY_RECOGNITION_THRESHOLDS`.
- **PROVISIONAL:** working proposals, refused in production.
- **APPROVED:** the only status production accepts. None exists yet.

**Production interpretation is disabled.** `DEFAULT_CANON_CONFIG` has interpretation
off and verifier roles unfinalized. With that config:
- `validateDerivedRecord`, `validateOrientation`, `validateRecognition` and
  `assessLadder` all refuse (`INTERPRETATION_DISABLED`);
- nothing can be marked `verified` (`VERIFIER_ROLES_UNFINALIZED`).

**The ladder grants nothing.** Reaching the top only marks a body of evidence
*eligible for human Recognition review*.

## Orientation (reserved)
- Never assigned automatically: a proposal must name a human review (`assignedBy:
  { kind: 'review' }`). `automatic` is rejected.
- Never resting on a single interaction (`NEVER_FROM_SINGLE_INTERACTION`). This is a Canon
  invariant ruling out the degenerate case, **not** a threshold.
- Accepted only if its evidence reaches the configured policy's review level on the
  ladder, under an allowed policy. *Two interactions is not a threshold*: the test suite
  shows a two-interaction proposal being refused under the test fixture.

## Recognition (reserved)
`validateRecognition` requires:
- interpretation enabled under an allowed policy;
- a live `SIGNATURE`-stage record for the same subject;
- confirmation by an `authorized-verifier` whose **role** is in the configured,
  currently unfinalized, verifier-role policy;
- a verifier who is not the subject and not an economic system.

Ownership has no path to Recognition.

## Authorized verifiers: configurable, unfinalized
`VerifierPolicy` has `UNFINALIZED` (default: no roles, nothing can be `verified`),
`TEST_ONLY` (test roles, tests only) and `APPROVED`. Who verifies is a future decision.

## No universal human value
`src/identity/canonical/guards.ts` bans these concepts everywhere:
- universal human score, overall human rank, overall player superiority;
- Orientation quality, Element superiority;
- employability score, education-worth score, social-credit score;
- worth, suitability, IQ.

Bare `score`/`rank`/`rating`/`percentile`/`tier`/`grade`/`level` fields are additionally
banned on Person, Identity and Canonical records.

**Scoped measures are permitted** (`src/entities/measures.ts`): Tournament Rank, Duel
Rank, Creator Rank, War Rank, Scholar achievement, economic performance, a specific skill.
Each must name its context and is refused if it tries to be overall, universal or human.

## Reserved concepts
| Concept | Status | Implementation |
|---|---|---|
| Metastrate | working definition: individual accumulated experiential state | `buildMetastrate`: a private index (ids + counts) over one person's raw evidence across all their Realms |
| Grandmeta | working definition: collective accumulated historical memory | `buildGrandmeta`: an index over realm/public Chronicle entries only; private history never enters |
| Infostrate, Metathymos, Metametrics, Metastrategy, Metamethodology Quotient | reserved | `ReservedConceptSlot` has no value field, so nothing can be stored |

## Identity contexts
`UNIVERSAL · REALM · WORK · LEARNING · CREATOR · PRIVATE · SHARED`, plus Canonical
Evidence as a separate store.
- `createPerson` makes the Person and a private UNIVERSAL identity.
- There is one identity per context; REALM identities are one per Realm.
- A person's own contexts **cannot see each other** unless the person creates an explicit,
  directional, revocable `IdentityLink`.
- Person and Identity records contain no score, rank, worth or suitability fields.

## Enforcement
- `tests/canonical.test.ts` covers the guards, the ladder, the disabled-by-default
  behaviour, the TEST_ONLY/PROVISIONAL/APPROVED gates and scoped measures, and checks
  that the code matches `canon/canonical.json`.
- `tests/architecture.test.ts` makes sure `src/identity` never imports the economy,
  contracts or familiars, and those never import identity. The economic loop and the
  evidence loop stay separate at the module level.
