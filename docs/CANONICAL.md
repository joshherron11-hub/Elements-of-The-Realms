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

## Orientation (reserved)
`validateOrientation` requires at least **2 distinct interactions**, a hard floor no
policy can lower: an Orientation is never assigned from one interaction. The
Orientation vocabulary and where it sits in the pipeline are undefined.

## Recognition (reserved)
`validateRecognition` requires:
- a live `SIGNATURE`-stage record for the same subject,
- confirmation by an `authorized-verifier` who is not the subject and not an economic
  system.

Ownership (property, Familiars, wealth) has no path to Recognition.

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
- `tests/canonical.test.ts` covers the guards and checks that the code matches `canon/canonical.json`.
- `tests/architecture.test.ts` makes sure `src/identity` never imports the economy,
  contracts or familiars, and those never import identity. The economic loop and the
  evidence loop stay separate at the module level.
