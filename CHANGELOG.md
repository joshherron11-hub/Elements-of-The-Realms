# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
