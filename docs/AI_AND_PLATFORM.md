# AI Service & the Play / Learn / Work / Create Platform

## AI: an optional interpretation layer
AI never sits on the deterministic path. These are always plain code and are refused by
the AI service if anyone tries to route them to a model (`DETERMINISTIC_ONLY`):
- movement and inventory math;
- crop and other timers;
- merchant arithmetic and pricing;
- property and ownership checks;
- save/load and ordinary state changes;
- Canonical derivation.

AI output is text for presentation. It never writes simulation state or Canonical
records. `tests/architecture.test.ts` makes sure `src/ai` only *reads* simulation
types: it cannot call a service that changes state.

### Pipeline (`src/ai/service.ts`)
`request(req, { density })`:
1. **Deterministic guard**: refuses gameplay tasks.
2. **Task check**: `npc-dialogue`, `chronicle-prose`, `rumor-synthesis`,
   `world-summary`, `political-proposal`, `creator-assist`, `semantic-search`,
   `education-assist` or `agent-planning`.
3. **AI density gate**: the server's constitution decides (see the table below).
4. **Provider routing and model selection**: the policy tier (small/medium/large)
   first, then the nearest tier, skipping unavailable providers.
5. **Cache**: an LRU with per-task time-to-live, keyed on canonical input.
6. **Rate limits**: a token bucket per user and a global one.
7. **User allowance**: a daily token and cost budget, with per-user overrides.
8. **Provider call**: failures come back as results, never crashes.
9. **Token and cost logging**: `usage()`, `totals()` and an `onUsage` sink.

`withFallback(req, ctx, fallback)` is how callers use AI. If the request is refused for
any reason, they get the authored/deterministic text, so play never depends on AI.

| Density | Model calls allowed |
|---|---|
| **MINIMAL** (default; Blackmere) | semantic search only |
| STANDARD | + NPC dialogue, Chronicle prose, world summaries, education help, creator help |
| RICH | + rumours, political proposals |
| CINEMATIC | + agent planning |

### Providers
- `OfflineProvider`: deterministic, free, no network. Used for development and the
  browser build.
- `ScriptedProvider`: for tests.
- Real HTTP providers implement the same `AiProvider` interface. **None is
  connected**: that needs an account and credentials, and keys must live behind a
  server endpoint, never in the browser.

### In the game today
The journal's **"Your tale so far"** is narrated via `narrate()`. On the MINIMAL
Blackmere server this uses the deterministic narrator, which retells the Chronicle's own
summaries and invents nothing. No model is called.

## Play / Learn / Work / Create on one kernel
No new products yet, but the shared model already expresses all four (see
`tests/platform.test.ts`):

| Need | Kernel pieces |
|---|---|
| **Work**: projects, teams, tasks, contracts, artifacts, outcomes, contributions, provenance, Professional Chronicle | organization `team`/`company` · contract `domain: WORK` · tasks · `Artifact` · `Contribution` · settlement outcomes · provenance · `chronicle.professional(actor)` |
| **Learn**: courses, projects, practice, tutoring, assessment, transfer, teaching, verified artifacts | organization `school` · contract `kind: course, domain: LEARN` · practice tasks · coursework `Artifact` · assessment as **raw evidence verified by an authorized verifier** (never a score) · mentor/learner `Contribution` roles · `chronicle.domain(actor, 'LEARN')` |
| **Create**: Forge, UGC, media, world creation, marketplace, creator reputation | `Artifact` (owned asset `kind: artifact`, with provenance and content hash) · ownership transfer (sale moves the asset, never the authorship) · scoped creator reputation · Forge mode (planned) |

New records: `Artifact` and `Contribution` (`src/platform`), stored in
`state.artifacts` / `state.contributions`. `ChronicleQuery.domains` gives
domain-filtered views over one continuous personal history: one person, many contexts.
