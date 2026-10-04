# Modes, Intents and Content Packs

## Intents
An **intent** is one thing a player asks to do: plain data such as
`{ kind: 'buy', marketId, itemId, quantity }`. Keyboard, UI and (later) agents only
produce intents, and `sim.modes.perform(actorId, intent)` executes them.

Intent kinds:
- `travel`, `talk`
- `buy`, `sell`, `gather`, `search`
- `accept-contract`, `complete-task`
- `purchase-property`
- `familiar-status`, `acquire-familiar`, `feed-familiar`, `rest-familiar`, `bond-familiar`

`perform` checks three things, then delegates to the owning service:
1. the actor's current mode allows the intent;
2. the server's rules allow its interaction category (talk → social, buy/sell → trade,
   accept/complete → contract, property → property, search → exploration,
   familiar intents → care);
3. locality: you must be at the market, with the person, or where an offer is made.

`sim.modes.available(actorId)` lists concrete intents possible right now, which the UI
can show as choices.

## Modes
All 17 modes are defined in `modes/modes.json`. Each mode lists its intents, the
interaction categories it needs and, optionally, the contract kinds it deals in.
Planned modes cannot be entered. Implemented modes can be entered only if every
required category is allowed and any `requires.pvp`/`requires.war` is satisfied.

| Mode | Status | Intents |
|---|---|---|
| **Live** (default) | implemented | travel, talk, buy, sell, gather, search, accept/complete contracts, purchase property, acquire / feed Familiars, Familiar status |
| **Companion** | implemented | travel, talk, familiar status / acquire / feed / rest / bond |
| **Explore** | implemented | travel, gather, search |
| **Invest** | implemented | travel, talk, investment contracts, purchase property |
| **Social** | implemented | travel, talk |
| **Search** | implemented | travel, talk, search, search contracts |
| Duel, War, Hunt, Heist, Empire, Drive, Veil, Forge, Tournament, Spectate, Scholar | planned | — |

### Approved definitions (planned modes)
- **Drive**: vehicle, mount, transport and movement-centred play: racing, travel,
  delivery, convoys, navigation, vehicle and mount ownership, route mastery and transport
  businesses. Its expression depends on the Realm. In Happy Fall that means horses,
  carriages, wagons, boats and mounts. Later Realms may have automobiles, aircraft or
  spacecraft (`realmExpressions` in the data).
- **Veil**: mystery, uncertainty, hidden information, psychological tension, folklore,
  supernatural-seeming events, investigation and horror-compatible experiences: rumors,
  omens, hidden history, uncertain threats, strange Familiars, curses as cultural claims.
  **Veil never makes supernatural claims Canonically true.** Cultural interpretation stays
  separate from verified Canonical evidence (`canonNote` in the data).
- **Hunt**: track, locate, pursue, observe, capture, recover or defeat a target, as the
  Realm and server rules allow. Targets can be Familiars, animals, lost objects,
  fugitives, rare resources, historical artifacts or NPC threats. **Hunting does not
  inherently require killing.**

The active mode is stored per actor (`state.activeModes`) and stamped on Chronicle
entries and raw evidence as `context.mode`.

## Search
`state.searchSpots` hold hidden finds at locations. Each actor finds each spot once. A
spot with `requiresFlag: "contract:<id>"` only appears while the actor holds that
contract.

## Content packs
`realms/<realm>/content/*.json` are merged in file-name order, structurally parsed,
then cross-checked:
- unique ids;
- every reference resolves;
- items fit within the Realm's technology and magic ceiling;
- the primary currency exists.

They hold currencies, items, resources, locations, routes, actors (with purse and
inventory), organizations, roles, markets, resource nodes, properties, risks, contracts
and search spots.

`bootstrapWorld` builds a fresh world for a server and applies the pack **through the
services**: coin is minted on the ledger, ownership is registered and contracts are
offered. `joinRealm` creates a Person (if new), a REALM identity, a player actor and
the Realm's starting purse, plus a first Chronicle entry.
