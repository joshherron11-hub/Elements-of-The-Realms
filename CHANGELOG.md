# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed — Blackmere Art Pass 2: characters, Familiars, props (presentation only)
- Character looks as data (`realms/happy-fall/looks/`, `src/render/looks.ts`): build,
  layered garments, hair, beard, hat, held item, idle stance per NPC; the player has a
  distinct hood, ember cloak and a glowing hip lantern.
- New people builder (`src/render/people.ts`) with elbows, smoothed poses, idle
  stances, talking gestures, turning steps, head tracking and interaction facing;
  shared rig contract in `src/render/rig.ts`.
- Familiars: Bramble sits, pants, eats from a bowl, play-bows and rests; Wick flutters,
  brightens and loops; Old Corvin hops, caws, pecks and stretches; care emotes.
- Props: authored `variant`s (validated), new stool, basket, bucket, keg rack, tool rack,
  wheelbarrow, trough, milestone and waymarker; upgraded stalls (trade-specific wares
  and signs), crates, barrels, sacks, benches, tables, bar, well, lamps, lanterns, signs,
  fences, banners and carts; produce and small goods instanced per section.
- Scenes re-dressed with purposeful groupings; tavern patrons seated facing their
  tables (`face` on ambient extras).
- Tests for looks, variants and prop-source hygiene.

### Changed — Blackmere Art Pass 1: placeholder geometry removed (presentation only)
- New art kit (`src/render/kit/geo.ts`, `kit/props.ts`): lathe, board, slab, tube,
  cluster, jitter, ribbed folds, world-scaled UVs and a merging `Assembly` with
  crack-free outlines; semantic materials (wood, stone, plaster, shingle, straw,
  weave, metal, painted, glow); painted surface textures and ground decals.
- Every prop rebuilt as a crafted model: houses (half-timbered or stone, shingle
  roofs, shuttered leaded windows, plank doors, chimneys, hanging signs), market
  stalls (trestles, curved striped canopies, valances, goods), barrels, crates, sacks,
  tables, benches, the bar, hearth, well, notice board, signposts, lamp posts,
  lanterns, banners, bunting, fences, pens, woodpiles, pumpkins, flowers, planters,
  trees, bushes, rocks, haystack, scarecrow, cart, bed, chest, shelf, shrine,
  memorial, boat, rug, walls, gatehouse and keep.
- Characters, Familiars and animals rebuilt with shaped bodies, faces, hair, hats and
  gear; same animation rig.
- Debug rings replaced by painted decals (exit chevrons, gather glints, tap target);
  square leaf particles replaced by leaf sprites; tree ring, hedges, grass and leaf
  scatter use kit geometry.
- `tests/artkit.test.ts`; smoke clock check now accepts any Day-1 morning time.

### Changed — Blackmere visual rescue (presentation only)
- Full-viewport, safe-area-aware canvas with ResizeObserver; closer, aspect-aware
  three-quarter camera clamped to the section; wheel/pinch/key zoom.
- Cel materials with a deep shadow band and rim light; warm key / cool fill; gradient
  sky dome; matched fog; selective bloom and soft shadows on the HIGH preset.
- Graphics presets LOW/HIGH (`src/render/quality.ts`), auto-detected, G to toggle.
- Larger rigged characters with role silhouettes, walk/run/idle/talk/sleep/seated
  animation, blob shadows; animated Familiars (trot, wag, sniff, flap, hop, joy after
  care) and animals.
- Painted procedural ground, cobble, road and plank textures; path kerbs; instanced
  ground scatter; instanced tree ring and foreground hedges; richer houses, stalls,
  board, well, hearth, lanterns; new props (sack, bunting, woodpile, pumpkins, bush,
  lantern, planter); denser town square, market, Hearth Row, keep approach, south
  green, tavern and cottage; interior cutaway walls; dust motes and hearth embers.
- HUD redesign: bundled Cinzel/Alegreya fonts, layered panels, status chips, segmented
  mode bar, key-badge prompts, name plates, bubble tails, vignette, readable minimap
  with buildings and caption, improved phone layout.
- Fixed: a tavern spot and the stall-tending spot sat inside furniture; new
  `tests/presentation.test.ts` keeps set dressing off spots, readables and routes.
- `docs/VISUALS.md`.

### Added — Blackmere world depth pass
- **Living world rules** (`realms/happy-fall/living/blackmere.json`, `src/world/living.ts`):
  calendar (24-min day, start 09:00), NPC daily routines (`RoutineService`), market hours
  and morning restock, NPC activity/friendly/bark lines, Familiar personality lines. Rules,
  not save data, so old saves gain them; new state (`npcActivity`, `stalls`,
  `Market.lastRestockDay`) defaults on load.
- **Player market stall** (`StallService`, intent `set-stall-listing`): list carried goods,
  deterministic seeded sales during stall hours, ledgered and chronicled.
- **Wicket Cottage** interior scene; door locked to non-owners; resting a Familiar at home.
- **Scenes:** town square, tavern and outskirts detail (props, activity spots, readables,
  townsfolk, patrons, animals, water, smoke, leaves, fireflies).
- **Presentation:** routine-driven NPC walking, idle and sleep; trail-following Familiars
  with sniffing and reaction bubbles; time-of-day lighting; ambient animation; dynamic
  notice board, rumours, price board and deeds; relationship labels; merchant barks;
  floating coin numbers; objectives tracker; minimap; sound cues (WebAudio synth, M to
  mute); click/tap to walk and interact; joystick, action buttons and bottom-sheet panels on
  phones.
- Tests: `tests/living.test.ts`; smoke test extended with depth checks and a phone viewport.
- `docs/LIVING.md`.

### Fixed
- Worlds founded without an explicit clock (the browser) recorded `createdAt = 0`; the
  calendar now starts when the world is founded.

### Changed — Owner decisions (pre-PR)
- **Canon thresholds:** removed the "2 interactions" Orientation floor as a threshold.
  Added the Recognition ladder (FIRST READ → OBSERVED → REPEATED → CROSS-CONTEXT →
  STABLE → RECOGNITION) with configurable per-stage `RecognitionThresholdPolicy`
  (TEST_ONLY / PROVISIONAL / APPROVED). Canonical interpretation is disabled by default
  and production accepts only APPROVED policies. Orientation requires a named human
  review and is never automatic. Authorized verifier roles are configurable and
  UNFINALIZED (nothing can be `verified` by default).
- **Banned concepts:** universal-value concepts banned everywhere; bare score/rank
  fields banned on Person/Identity/Canonical records; scoped `ContextualMeasure` with a
  validator.
- **Modes:** approved definitions of Drive, Veil and Hunt (`realmExpressions`,
  `canonNote`).
- **AI:** Anthropic recorded as the first planned real provider (`PROVIDER_PLAN`);
  architecture test keeps keys and direct provider calls out of client code.
- **Happy Fall:** `launchPreset: PEACEFUL`; Consent War and Protected Civilian are
  future-compatible (not enabled); Full Conflict not exposed. Involuntary property
  seizure is refused on SAFE servers.
- **Placeholders:** `$provisional` markers in data and `docs/PROVISIONAL.md`.
- **Technical debt:** `docs/BACKLOG.md`.


### Added — Phase 11: First complete playable loop
- `tests/loop.test.ts`: the exact loop through intents, including save + reload.
- `scripts/smoke-loop.mjs` / `npm run smoke`: plays the loop in headless Chromium
  through the real UI and checks state after a page reload.
- In-game **Next:** guide (`src/ui/guide.ts`, presentation-only).
- `docs/LOOP.md` walkthrough.

### Changed
- Narrated tale skips bookkeeping entries and keeps names capitalised; contract
  lines no longer repeat their status.


### Added — Phase 10: AI service + platform compatibility
- `src/ai`: `AiService` with deterministic-task guard, server AI-density gate, tier
  routing/model selection, LRU cache with TTLs, per-user and global rate limits,
  daily per-user allowances, token/cost usage log, `withFallback`; `OfflineProvider`
  and `ScriptedProvider`; Chronicle `narrate` with a deterministic narrator.
- `src/platform`: `Artifact` and `Contribution` records and `ArtifactService`;
  `ChronicleQuery.domains`, `chronicle.domain()` and `chronicle.professional()`.
- Journal shows "Your tale so far" (deterministic on MINIMAL servers).
- Architecture test: the AI layer may only read simulation types.
- `docs/AI_AND_PLATFORM.md`. 30 new tests (246 total) incl. Work, Learn and Create
  scenarios built from kernel primitives.

### Changed
- Joining a Realm records the arrival before the first discovery.


### Added — Phase 9: Chronicle + persistence
- Personal Chronicle: query by event family, location, time; ordering, paging,
  viewer visibility (`canView`), `latest`, `summary`. Realm/Organization Chronicles
  share the query interface.
- New Chronicle entries: `investment.made`, `economy.loss` / `economy.gain`;
  completed NPC contracts read "Helped <name>: <title>".
- `src/persistence`: storage adapters, `SaveService` (versioned format, FNV-1a
  checksum, list/export/import/delete), ordered world migrations and normalisation.
- `src/ui/session.ts`: resume the saved world or found a new one; capped catch-up of
  time away; presentation snapshot (section + position).
- Browser: autosave (30 s, tab hidden, page close), K save, L load, N new game,
  welcome-back message; resumes at the saved spot.
- `docs/CHRONICLE_AND_SAVES.md`. 19 new tests (216 total).


### Added — Phase 8: Familiars
- `FamiliarSpecies` data; `FamiliarService` (create, acquire, feed, rest, bond,
  status, offers, time-based care decay, follow-owner, per-Familiar Chronicle
  history, bond milestones).
- Intents `acquire-familiar`, `feed-familiar`, `rest-familiar`, `bond-familiar`;
  Live and Companion modes updated.
- `30-familiars.json`: Russet Hound, Lantern Moth and Keep Raven species; Bramble
  (Hester's hound pup), Wick (Sela's moth) and Old Corvin (the council's raven).
  Hound Biscuits and Seed Cake carry distinct diet tags.
- Content packs accept `familiarSpecies` and `familiars`, validated (species, owner,
  location, diet coverage).
- UI: hound/moth/raven figures, follower behaviour, adoption in dialogue,
  Companions panel (C).
- `docs/FAMILIARS.md`. 12 new tests (197 total): ownership, care state, bond
  changes, save/load, no Recognition from ownership.


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
