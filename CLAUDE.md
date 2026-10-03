# CLAUDE.md — Working agreement for AI contributors

This file tells Claude (and any AI or human contributor) how to work in this repository.

## What this project is
**Elements of the Realms** is a persistent, browser-first civilization platform.
We build a **universal kernel once**; Realms, servers and modes are **configurations on top**.

- First Realm: **Happy Fall** (type `ANCHORED`, medieval / early-fantasy ceiling)
- First location: **Blackmere**
- First release: **PEACETIME / CIVILIZATION-FIRST** — no large-scale war.

## Commands
```bash
npm install        # once
npm run dev        # browser preview at http://localhost:5173
npm test           # vitest, all tests
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production bundle in dist/
```
Always run `npm run typecheck && npm test` before committing.

## Layering rules (non-negotiable)
1. **Simulation** (`src/core`, `src/world`, `src/entities`, `src/economy`, `src/familiars`,
   `src/contracts`, `src/chronicle`, `src/identity`, `src/modes`, `src/simulation.ts`,
   `src/seed.ts`) must not import from
   `src/render`, `src/ui`, `src/persistence`, or `src/ai`, and must not touch the DOM,
   `window`, `localStorage`, `Date.now()` or `Math.random()` directly. Use the injected
   `Clock` and `IdFactory`.
2. **Presentation** (`src/render`, `src/ui`) reads simulation state and sends player
   intents. It never contains gameplay rules.
3. **Persistence** (`src/persistence`) serialises plain state. It never decides gameplay.
4. **AI interpretation** (`src/ai`) is optional and never on the hot path. No LLM calls
   for movement, inventory math, timers, prices, ownership checks, save/load or other
   deterministic state changes.
5. Modules communicate through the `Kernel` services and the `EventBus`, not by
   reaching into each other's internals.

Rule 1 is enforced by `tests/architecture.test.ts`.

## Where things live
See `docs/KERNEL.md` for the concept → type → service → file map. New gameplay
should compose existing services; if logic would be duplicated, move it into the
owning service instead.

## Data-driven rule
Realm definitions and content packs (`/realms`), server constitutions
(`/server-constitutions`), modes (`/modes`) and canon (`/canon`) are data, loaded and
validated by `src/config/content.ts`. Adding a Realm, server type, NPC, item or contract should not
require editing kernel code.

## Canon guardrails
Read `CANON_GUARDRAILS.md` before touching identity, Canonical evidence, Recognition,
economy-vs-evidence boundaries, or anything war-related. Key points:
- Raw observation stays separate from derived interpretation.
- Declared identity ≠ observed behavior ≠ verified Recognition.
- No universal human score, no Universal Human Rank.
- Money buys opportunity, not Canonical truth.

## When to stop and ask the project owner
Only when a decision changes Canon, creates irreversible architecture, needs payment
credentials or external accounts, requires a destructive operation, or two materially
different product directions cannot safely share a default. Otherwise: build, test,
inspect, repair, continue.

## Conventions
- TypeScript strict mode; prefer plain data objects + pure functions/services.
- Gameplay rejections return `Result` (`ok` / `err`); exceptions are for programmer error.
- Ids are branded strings (`Id<'actor'>`), created via `IdFactory`.
- Tests live in `/tests`, named `*.test.ts`.
- Use original names and placeholder assets only. Never copy franchise characters/assets.
- Presentation sends **intents** (`src/modes/types.ts`) to `sim.modes.perform`; it never
  calls services to change state directly.
- Update `CHANGELOG.md` with each meaningful change.
