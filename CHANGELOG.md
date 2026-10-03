# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added — Phase 7: Economy, contracts, property
- `20-blackmere-life.json`: merchant contract (Apples for Quill's), search contract
  (The Lost Satchel), investment (A Share in the Cider Press), social happening
  (A toast with a stranger), two properties for sale, five organizations (council,
  two guilds, clan and faction placeholders), hidden finds in Hollowmere Wood.
- `wait` task requirement; periodic market `drift` through risk profiles (market
  fluctuation); `HappeningService` for data-driven social events; property purchase
  at the property or a `civic` office.
- UI: hand-over list with readiness, deeds at the Reeve, journal standing and
  relationships, toasts for happenings and price changes; debug teleport now goes
  through travel intents.
- `docs/ECONOMY.md`. 9 new tests (184 total).


### Added — Phase 6: Blackmere
- `10-blackmere.json`: 10 locations, 8 routes, six NPCs (innkeeper, merchant,
  farmer, courier, local official, traveler) with authored dialogue, two markets,
  orchard and deadwood resource nodes.
- Actor `profile` (title, greeting, lines); `talk` returns it.
- Scene layouts (presentation data) for the town, tavern interior and outskirts, with
  a validating parser; zones map ground to simulation locations.
- Renderer: toon materials, inverted-hull outlines, painted 2.5D backdrops, props,
  character figures, follow camera, name labels; palette from Realm art metadata.
- Browser game: keyboard movement with collision, zone-crossing and exits as
  `travel` intents, NPC dialogue with contracts/buy/sell/hand-in choices, gather,
  search, mode bar, inventory and journal panels, toasts.
- 11 new tests (174 total): area/NPC coverage, reachability, layout consistency
  (zones, spawns, NPC placement, exits vs. routes), collision, walking → travel.


### Added — Phase 5: Modes + Happy Fall
- `modes/modes.json`: 17 modes. Live, Companion, Explore, Invest, Social and Search
  are implemented; the rest are defined and cannot be entered.
- Intent layer (`src/modes`): plain-data player intents executed by `ModeService`
  after checking the mode, server rules and locality; `available()` lists current
  options. Per-actor active mode stamped on Chronicle/evidence.
- `SearchService` and contract-gated search spots.
- Content packs: parser, merger, cross-reference/ceiling validator;
  `bootstrapWorld` applies packs through services; `joinRealm` onboards a person.
- Happy Fall: Chromatic Mythic 2.5D art direction metadata (palette, rendering
  policy, IP note) used by the renderer; economy pack (Mark currency, 13 original
  items, market/shipment/venture risk profiles).
- Talking records raw evidence (`meta.evidence`) without a Chronicle entry.
- 17 new tests (158 total).


### Added — Phase 4: Realms + server constitutions
- Realm types ANCHORED, ASCENDANT, ECHO, FRACTURE, PLANETARY, INTERREALM
  (`canon/realm-types.json`) and technology/magic scales (`canon/technology.json`).
- Data-driven Realm Constitution: technology ceiling, progression, imports/exports,
  economic rules, cross-Realm transfer, legal interaction categories, server
  restrictions, PvP, property, AI density, Canonical strictness, persistence.
- Ten server presets as JSON; PEACEFUL is the default and matches the specified
  variables.
- Dependency-free content validator reporting every error with its path.
- `resolveServerRules` checks preset + overrides against Realm caps and the release
  gate (war blocked in PEACETIME); `allowsInteraction`, `pvpAllowed`.
- `planRealmTransfer`: person/identity/history always travel; equipment filtered.
- Happy Fall Realm Constitution and default Blackmere PEACEFUL server; content
  registry loaded at startup; HUD shows the resolved rules.
- `orientationPolicyFor(strictness)` uses the hard floor pending Canon approval.
- 22 new tests (141 total).


### Added — Phase 3: Canonical / identity rules
- Record layers (`declared`, `observed`, `derived`, `recognized`) on identity and
  evidence records.
- Self-contained raw `Evidence` (actor, target, time, location, context, action type,
  outcome, provenance, verification) with append-only verification history and strict
  transition rules (no self-verification, no economic source).
- Chronicle-worthy actor events are automatically recorded as raw interactions.
- `IdentityService`: Person + UNIVERSAL identity, one identity per context (REALM per
  Realm), declared-claim log, explicit revocable cross-context links.
- Reserved Canonical pipeline (`DerivedRecord`, `CanonicalDeriver`) with
  `validateDerivedRecord`; `validateOrientation` (≥ 2 distinct interactions, hard
  floor); `Recognition` + `validateRecognition`.
- Metastrate and Grandmeta as raw indexes; other concepts reserved with no value slot.
- `canon/canonical.json` reference data; `docs/CANONICAL.md`.
- Tests: Canonical guards, identity separation, verification rules, canon/code
  consistency, and an architecture test that keeps the economic and evidence loops apart.

### Changed
- `InteractionService` moved to `src/identity/evidence.ts`; `WorldState` gains
  `claims`, `identityLinks` and reserved `canonical` storage.


### Added — Phase 2: Universal kernel
- Core: seeded serialisable `Rng`, shared id aliases and reference shapes
  (`OwnerRef`, `AssetRef`, `ScopeRef`, `PlatformDomain`), `Provenance`, math helpers.
- Types for Actor, Identity/Person, Realm/Server refs, Organization (Faction, Clan),
  Role, Permission, AuthorityGrant, Ownership, Property, Item, Inventory, Currency,
  Ledger, Market, Resource, Route, Location, Relationship, Reputation, Risk,
  Contract, Task, Interaction, Evidence, Chronicle, Familiar, WorldState.
- Services: Actor, World (travel, Dijkstra path-finding, discovery), Ownership,
  Inventory, Economy, Market, Property, Resource, Risk, Organization, Authority,
  Relationship, Reputation, Contract, Chronicle, Interaction.
- `Simulation` facade wiring all services to one `WorldState`.
- Chronicle records any event flagged meaningful; Realm/Organization chronicle
  interfaces.
- Tests: ownership, inventory, economy, market, risk, contracts (delivery,
  issuer default, deadline, investment), world, social, authority, chronicle,
  serialisation round-trip, and an architecture-boundary test (91 total).
- `docs/KERNEL.md` concept map.


### Added
- Project foundation (Phase 1): repository structure, TypeScript (strict), Vite,
  Vitest, Three.js.
- Core runtime: branded ids (`IdFactory`), `Clock`, `Result`, `EventBus`,
  `Kernel` module host with init/tick/dispose lifecycle.
- Placeholder Three.js stage with toon shading in the Chromatic Mythic autumn palette.
- Documents: `CLAUDE.md`, `README.md`, `ARCHITECTURE.md`, `CANON_GUARDRAILS.md`,
  `ROADMAP.md`, `CHANGELOG.md`.
- Core tests (8).
