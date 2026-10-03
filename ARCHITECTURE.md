# Architecture

## 1. Core idea
One **universal kernel** models civilization: actors, ownership, resources, contracts,
routes, relationships, risk, authority, reputation, provenance and history.
Everything specific — a Realm, a server's rules, a mode, a town — is **configuration
and content** loaded on top of the kernel.

```
          ┌────────────────────────────────────────────────────────────┐
 Content  │ Realms (Happy Fall) · Locations (Blackmere) · NPCs · Items │  data
          ├────────────────────────────────────────────────────────────┤
 Config   │ Realm Constitution · Server Constitution · Mode definitions│  data
          ├────────────────────────────────────────────────────────────┤
 Kernel   │ Actor · Ownership · Inventory · Contract · Route · Risk ·  │  code
          │ Relationship · Reputation · Provenance · Chronicle · …     │
          ├────────────────────────────────────────────────────────────┤
 Core     │ Ids · Clock · Result · EventBus · Kernel module host       │  code
          └────────────────────────────────────────────────────────────┘
```

## 2. The four separated concerns

| Concern | Lives in | May depend on | Must never |
|---|---|---|---|
| **Simulation** | `core`, `world`, `entities`, `economy`, `familiars`, `contracts`, `chronicle`, `identity` | `core` and each other via events/services | touch DOM, storage, network, AI, real time or randomness directly |
| **Presentation** | `render`, `ui` | simulation (read), player intents (write) | contain gameplay rules |
| **Persistence** | `persistence` | plain serialisable state | decide gameplay outcomes |
| **AI interpretation** | `ai` | simulation (read), Chronicle | sit on the deterministic hot path or write Canonical truth |

Determinism comes from injecting `Clock` and `IdFactory` (and later an RNG) into the
kernel. Tests use `ManualClock` and `SequentialIdFactory`.

## 3. Kernel runtime (implemented)
- `Id<Brand>` — branded string ids, serialisable, type-safe.
- `Clock` — `SystemClock` (live) / `ManualClock` (tests, replay).
- `Result<T>` — gameplay rejections are values, not exceptions.
- `EventBus` — synchronous in-process pub/sub; handler failures are isolated.
- `Kernel` — hosts `KernelModule`s with `init` / `tick` / `dispose` lifecycle.

Systems announce facts on the `EventBus`; observers (Chronicle, persistence, UI,
AI) subscribe. This is how simulation stays ignorant of who watches it.

## 3a. Universal kernel services (implemented)
All simulation state lives in one plain-data `WorldState` (`src/world/world-state.ts`).
Services receive a `SimContext` (`state`, `clock`, `ids`, `events`, seeded `rng`) and
each owns exactly one concern:

| Service | Owns |
|---|---|
| `ActorService` | actors |
| `WorldService` | locations, routes, travel, path-finding, discovery |
| `OwnershipService` | the single ownership registry for every distinct asset |
| `InventoryService` | fungible item stacks |
| `EconomyService` | wallets, the ledger, mint/burn/transfer |
| `MarketService` | prices over a vendor (reuses economy + inventory) |
| `PropertyService` | property purchase (reuses ownership + economy) |
| `ResourceService` | resource nodes, gathering, regeneration |
| `RiskService` | weighted outcome resolution over the seeded RNG |
| `OrganizationService` | membership (organizations, factions, clans, guilds…) |
| `AuthorityService` | permission checks (ownership, roles, grants, nested scopes) |
| `RelationshipService` / `ReputationService` | directed relationships; scoped reputation |
| `ContractService` | contracts and tasks (reuses economy, inventory, risk, reputation, relationships, world) |
| `ChronicleService` | append-only history, fed from the event bus |
| `InteractionService` | raw interaction + evidence records (no interpretation) |

`Simulation` (`src/simulation.ts`) wires them together and registers one kernel
module that ticks resources and contract deadlines. See `docs/KERNEL.md` for the
full concept map.

## 4. Composition, not special cases
Activities are compositions of shared primitives, never bespoke subsystems:

| Activity | Composed from |
|---|---|
| Farming | Ownership + Property + Resources + Contracts + Routes + Chronicle |
| Merchant | Ownership + Inventory + Contracts + Routes + Reputation + Economy |
| Familiar care | Actor + Ownership + Relationship + Resources + Chronicle |
| Investment | Ownership + Contracts + Risk + Resources + Outcomes + Chronicle |
| Exploration | Routes + Discovery + Risk + Provenance + Chronicle |
| Politics | Authority + Organization + Relationships + Contracts + Reputation + Chronicle |
| Future war | Faction + Clan + Resources + Routes + Property + Authority + Morale + Cohesion + Chronicle |

If a new feature seems to need logic duplicated from another, the shared logic belongs
in the kernel.

## 5. Two loops that never merge
- **Economic loop**: currency, property, markets, investment. Money buys access,
  property, scale, beauty, logistics, infrastructure and opportunity.
- **Evidence loop**: raw interaction evidence → (future) Canonical derivation →
  Recognition. Money cannot buy Canonical truth, Signature, Recognition, fabricated
  evidence or rewritten history.

The two loops may read each other's *records* (a purchase is an interaction), but no
economic operation may write to derived Canonical state. This is enforced at module
level (`src/identity` and `src/economy|contracts|familiars` never import each other)
and at record level (economic systems are rejected as authors of derived records or
Recognition). See `docs/CANONICAL.md`.

## 6. Identity contexts
One person, many contexts: Universal, Realm, Work, Learning, Creator, Private, Shared
identities plus Canonical Evidence. Contexts are separate records linked to one
person; visibility is per context, and a person's own contexts see each other only
through explicit, revocable links. There is no universal score or rank. Records carry
a `layer` (`declared`, `observed`, `derived`, `recognized`), and the layers never merge.

## 7. Realms, servers, modes
- **Realm** — a civilization with a type (`ANCHORED`, `ASCENDANT`, `ECHO`, `FRACTURE`,
  `PLANETARY`, `INTERREALM`) and a Realm Constitution (technology ceiling, imports/
  exports, cross-Realm transfer, economy and legal rules).
- **Server Constitution** — the rules of one running world (`PEACEFUL`, `PRIVATE`, …):
  war, PvP, property risk, crime, AI density, persistence, access, Canonical strictness.
- **Mode** — an activity frame (Live, Companion, Explore, Invest, Social, Search…).

All three are data validated by kernel parsers.

**Your person travels further than your equipment**: identity and history cross Realm
boundaries freely; items and wealth cross only as the Realm Constitutions allow.

## 8. World geometry vs. history
The world is **continuous in history, not necessarily in geometry**. Locations may be
separate scenes connected by routes; the Chronicle and world state are one continuous
record.

## 9. Persistence
Simulation state is plain data. A persistence adapter (browser `localStorage` first,
server-side later) serialises a versioned snapshot. Schema versions allow migration.

## 10. AI
`src/ai` exposes a provider-agnostic service with routing, model selection, cost
logging, caching, rate limits, per-user allowance and server AI density
(`MINIMAL` default). Deterministic gameplay never calls it.
