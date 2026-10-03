# Universal Kernel Reference

Every concept below is Realm-agnostic. Happy Fall, Blackmere and future Realms
supply *data* for these types; none of them add kernel code.

## Concept → location

| Concept | Type(s) | Service | File |
|---|---|---|---|
| Actor | `Actor`, `ActorKind`, `ActorController` | `ActorService` | `src/entities/actor.ts`, `actors.ts` |
| Identity | `Person`, `Identity`, `DeclaredClaim`, `IdentityLink` | `IdentityService` | `src/identity/types.ts`, `identity.ts` |
| Realm | `RealmRef`, `RealmType` | — (Phase 4) | `src/world/types.ts` |
| ServerConstitution | `ServerRef` | — (Phase 4) | `src/world/types.ts` |
| Organization / Faction / Clan | `Organization`, `Faction`, `Clan`, `Membership` | `OrganizationService` | `src/entities/organization.ts`, `organizations.ts` |
| Role / Permission / Authority | `Role`, `Permission`, `AuthorityGrant` | `AuthorityService` | `src/entities/authority.ts`, `organizations.ts` |
| Ownership | `OwnershipRecord`, `AssetRef`, `OwnerRef` | `OwnershipService` | `src/economy/ownership.ts` |
| Property | `Property` | `PropertyService` | `src/economy/property.ts` |
| Item | `ItemDefinition`, `ItemInstance` | (via inventory/ownership) | `src/entities/item.ts` |
| Inventory | `Inventory` | `InventoryService` | `src/economy/inventory.ts` |
| Currency | `CurrencyDefinition`, `Wallet`, `LedgerEntry` | `EconomyService` | `src/economy/economy.ts` |
| Market | `Market`, `MarketListing` | `MarketService` | `src/economy/market.ts` |
| Resource | `ResourceDefinition`, `ResourceNode` | `ResourceService` | `src/economy/resources.ts` |
| Risk | `RiskProfile`, `RiskOutcome` | `RiskService` | `src/economy/risk.ts` |
| Contract / Task | `Contract`, `Task`, `Reward`, `TaskRequirement` | `ContractService` | `src/contracts/` |
| Location / Route | `Location`, `Route` | `WorldService` | `src/world/types.ts`, `world.ts` |
| Relationship | `Relationship` | `RelationshipService` | `src/entities/social.ts` |
| Reputation | `Reputation` (always scoped) | `ReputationService` | `src/entities/social.ts` |
| Provenance | `Provenance` | `provenance()` | `src/core/provenance.ts` |
| Interaction / Evidence | `Interaction`, `Evidence` (raw only) | `InteractionService` | `src/identity/evidence.ts` |
| Canonical (reserved) | `DerivedRecord`, `Recognition`, `OrientationAssignment`, `Metastrate`, `Grandmeta` | validators only | `src/identity/canonical/` (see `docs/CANONICAL.md`) |
| Event | `KernelEvent`, `DomainEvent`, `EventMeta` | `EventBus`, `emit()` | `src/core/events.ts`, `src/world/context.ts` |
| Chronicle | `ChronicleEntry`, `ChronicleScope` | `ChronicleService` | `src/chronicle/` |
| WorldState | `WorldState` | `createWorldState()` | `src/world/world-state.ts` |
| Familiar | `Familiar`, `FamiliarCareState` | — (Phase 8) | `src/familiars/types.ts` |

## How services compose

```
MarketService ──► EconomyService (money)      PropertyService ──► EconomyService
      └────────► InventoryService (goods)            └─────────► OwnershipService

ContractService ──► Economy · Inventory · Risk · Reputation · Relationships · World
AuthorityService ─► Ownership (implicit owner rights) · World (location nesting)
ChronicleService ◄── EventBus ◄── every service (events with meta.chronicle = true)
```

`Simulation` (`src/simulation.ts`) is the only place services are constructed.

## Rules the kernel enforces
- Money and quantities are positive safe integers. No floats in balances.
- All money movement is ledgered; money enters only via `mint`, leaves only via `burn`.
- Multi-step operations (buy, sell, move, purchase) validate everything before
  changing anything.
- Reputation has no global scope. There is no aggregate score of a person.
- Chronicle is append-only; corrections are new entries.
- Randomness is the seeded `Rng` stored in `WorldState`, so save/load preserves the future.
- Contract rewards are paid by the issuer; an issuer that cannot pay defaults
  (`issuer-default`) — economic risk without combat.

## Play / Learn / Work / Create
`PlatformDomain` is carried by contracts, tasks, organizations and chronicle
entries. A Work "project" is an organization of kind `team`/`company` with
contracts and tasks; a Learn "course" is an organization of kind `school` with
tasks; Create "artifacts" are assets of kind `artifact` in the ownership registry.
