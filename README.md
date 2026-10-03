# Elements of the Realms

A persistent, browser-first civilization platform.

> **Build the universal kernel once. Let Realms and modes become configurations on top.**

| | |
|---|---|
| First Realm | **Happy Fall** — `ANCHORED`, medieval / early-fantasy technology ceiling |
| First location | **Blackmere** |
| First release | **Peacetime / civilization-first** (no large-scale war) |
| Art direction | **Chromatic Mythic 2.5D** — autumn palette, strong silhouettes, cel shading |

## Quick start
Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```
Then open **http://localhost:5173** in a browser.

```bash
npm test           # run the test suite
npm run typecheck  # strict TypeScript check
npm run build      # production bundle → dist/
npm run preview    # serve the production bundle
```

## Repository layout
```
/canon                  Canon reference data and definitions (data, not code)
/realms                 Realm definitions (e.g. realms/happy-fall)
/server-constitutions   Server constitution presets (PEACEFUL, PRIVATE, …)
/src
  /core                 Universal kernel: ids, clock, results, event bus, module host
  /world                Locations, areas, navigation, world state
  /entities             Actors, NPCs, items
  /economy              Currency, inventory, markets, routes, risk
  /familiars            Familiar species, care loop, bonds
  /contracts            Contracts and tasks
  /chronicle            Chronicle (structured history records)
  /identity             Identity contexts and Canonical evidence (raw only)
  /ai                   AI service abstraction (optional, never on the hot path)
  /ui                   DOM/HUD presentation
  /render               Three.js presentation
  /persistence          Save/load adapters
  /modes                Modes and player intents
  /config               Build config + content loading/validation
/tests                  Vitest test suites
/docs                   Design notes and deeper documentation
```

## Why Three.js (and not Babylon.js)
Both are capable. We chose **Three.js** because:

1. **The art direction is custom.** Chromatic Mythic 2.5D needs toon/cel shading,
   layered painterly backdrops, outline passes and selective detail. Three.js is a
   thin, flexible renderer that makes custom materials and shaders straightforward
   without fighting an engine's opinions.
2. **The kernel owns the game, not the renderer.** Babylon.js is closer to a full
   engine (physics, GUI, scene management). We deliberately keep those concerns in
   our own simulation layer so the renderer stays swappable. A thinner renderer fits
   that boundary better.
3. **Browser-first weight.** Three.js is smaller and tree-shakes well, which matters
   for fast first load on modest hardware.
4. **Ecosystem.** The largest community, examples and tooling for stylised WebGL,
   and a clear path to WebGPU.

Trade-off accepted: we write a little more ourselves (input, camera rigs, UI), which
we want to own anyway.

**React** is not used yet. The HUD is small and plain TypeScript keeps presentation
dependencies minimal. React may be added later for richer panels (inventory,
Chronicle, contracts) without affecting simulation code.

## Tooling
TypeScript (strict) · Vite · Vitest · Three.js

## Documentation
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — kernel design and layering
- [`CANON_GUARDRAILS.md`](CANON_GUARDRAILS.md) — rules the platform must never break
- [`docs/KERNEL.md`](docs/KERNEL.md) · [`docs/CANONICAL.md`](docs/CANONICAL.md) · [`docs/REALMS.md`](docs/REALMS.md) · [`docs/MODES.md`](docs/MODES.md)
- [`ROADMAP.md`](ROADMAP.md) — build phases
- [`CHANGELOG.md`](CHANGELOG.md) — what changed
- [`CLAUDE.md`](CLAUDE.md) — working agreement for AI contributors
