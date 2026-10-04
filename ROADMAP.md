# Roadmap

Status: ✅ done · 🚧 in progress · ⬜ planned

## Phase 1 — Project foundation ✅
- ✅ Repository structure, TypeScript, Vite, Vitest, Three.js
- ✅ Core runtime: ids, clock, result, event bus, kernel module host
- ✅ Foundation documents
- ✅ Placeholder Three.js stage (Chromatic Mythic palette, toon shading)

## Phase 2 — Universal kernel ✅
Generic types and services: Actor, Identity, Realm, ServerConstitution, Organization,
Faction, Clan, Ownership, Property, Contract, Resource, Inventory, Route, Relationship,
Risk, Authority, Reputation, Provenance, Interaction, Evidence, Event, Chronicle,
WorldState, Familiar, Item, Currency, Market, Task, Location, Role, Permission. Services, `WorldState`, `Simulation` facade, 91 tests.

## Phase 3 — Canonical / identity ✅
Raw evidence records with verification, reserved Canonical pipeline interfaces and
validators, Orientation/Recognition guards, Metastrate/Grandmeta raw indexes,
separated identity contexts with explicit links.

## Phase 4 — Realms + server constitutions ✅
Six Realm types; data-driven Realm Constitution; ten server presets (default
`PEACEFUL`); validated resolution against Realm caps and the PEACETIME release gate;
cross-Realm transfer planning; Happy Fall constitution and default Blackmere server.

## Phase 5 — Modes + Happy Fall ✅
17 modes as data; Live, Companion, Explore, Invest, Social and Search implemented over
a data-only intent layer; search spots; content-pack format, validation and
bootstrap; Happy Fall art direction (Chromatic Mythic 2.5D) and economy pack.

## Phase 6 — Blackmere ✅
Town Square, Tavern, Market, Hearth Row, East Road, Brindle Farm Edge, Hollowmere
Woodland Edge, Keep Gatehouse across three sections; movement with collision, follow
camera, zone-driven travel, exits, NPC dialogue/trade, gathering, search, journal.

## Phase 7 — Economy, contracts, property ✅
Merchant, search and investment contracts; a social happening; market drift; property
deeds via the civic office; council, guilds, clan and faction placeholders; journal
standing view.

## Phase 8 — Familiars ✅
Species data, Familiar service, care loop (feed/rest/bond/status), acquisition,
following, bond milestones in the Chronicle, three examples (hound, moth, raven),
companion UI.

## Phase 9 — Chronicle + persistence ✅
Complete Personal Chronicle (queries, visibility, summary); Realm/Organization
Chronicle interfaces; versioned, checksummed saves with migrations; autosave,
resume with capped catch-up, save/load/new controls.

## Phase 10 — AI abstraction + Play/Learn/Work/Create compatibility ✅
AI gateway (guard, density, routing, cache, limits, allowance, cost log, fallback);
artifacts, contributions, domain Chronicle views; narrated journal (deterministic at MINIMAL).

## Phase 11 — First complete playable loop ✅
Enter Blackmere → move → speak to NPC → receive contract → visit market → acquire
companion → care for companion → complete search/delivery → receive currency and
reputation → make a small investment or ownership decision → Chronicle records it →
save → reload → state remains. Verified by `tests/loop.test.ts` and `npm run smoke`.

## Phase 12 — Hardening and next steps ⬜
1. Touch / mouse controls and a phone-friendly HUD.
2. Server-authoritative persistence and accounts (multi-device saves, shared servers).
3. Deeper Blackmere life: day/night, NPC routines, farming on owned plots, Forge crafting.
4. A real AI provider behind a server endpoint for STANDARD-density servers.
5. Realm Chronicle / Grandmeta views and Canon-approved derivation methods.

## Later (not first release)
Consent-war servers, conflict systems, additional Realms, Interrealm spaces, Work,
Learn and Create products, creator marketplace.
