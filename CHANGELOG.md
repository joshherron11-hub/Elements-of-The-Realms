# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
