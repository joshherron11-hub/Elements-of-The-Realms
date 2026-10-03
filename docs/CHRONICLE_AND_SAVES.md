# Chronicle & Persistence

## Chronicle
Every meaningful event can create a Chronicle entry. A service marks the event
`chronicle: true` and the `ChronicleService` records it as structured data:

`timestamp · actor · event · location · context (realm, server, domain, mode) ·
participants · outcome · summary · data · provenance · visibility · sourceSystem ·
scopes · corrects?`

The Chronicle is append-only; a correction is a new entry that cites the original. Prose
can be generated from the structured entries later (AI layer) without changing them.

| Example | Event |
|---|---|
| arrived in a Realm | `realm.joined` |
| discovered a location | `location.discovered` |
| acquired a Familiar / bond deepened | `familiar.acquired`, `familiar.bond-deepened` |
| accepted / completed a contract ("Helped Pip…") | `contract.accepted`, `contract.completed` |
| made an investment / lost or made money | `investment.made`, `economy.loss`, `economy.gain` |
| bought property / ownership changed | `property.purchased`, `ownership.transferred` |
| joined an organization | `organization.joined` |
| formed a relationship | `relationship.formed` |
| social happening | `happening.occurred` |
| merchant route or market changed | `route.status-changed`, `market.price-changed` (Realm-visible) |

### Personal Chronicle (complete)
`sim.chronicle.personal(actorId)`:
- `entries(query)` filters by event or event family (`'contract.'`), location and
  time range, with ordering and paging. With `viewer` set, it returns only what that
  viewer may see.
- `latest(n)` and `summary()` (counts by event family).

**Visibility:**
- `private`: the actor only.
- `shared`: actor and participants.
- `organization`: members.
- `realm` / `public`: everyone.

Private history never enters collective memory (Grandmeta).

### Realm and Organization Chronicles
They share the same `ChronicleView` query interface (`sim.chronicle.realm()`,
`sim.chronicle.organization(id)`). Aggregation and prose layers come later.

## Persistence
Persistence serialises plain state and never decides gameplay.

| Piece | File |
|---|---|
| `StorageAdapter` (`WebStorage` for localStorage, `MemoryStorage` for tests/private mode) | `src/persistence/storage.ts` |
| `SaveService`: save, load, list, delete, export, import | `src/persistence/saves.ts` |
| World schema migrations + normalisation | `src/persistence/migrations.ts` |
| Session glue: resume or found, catch-up, save | `src/ui/session.ts` |

### Save file
```json
{ "meta": { "format": "eotr-save", "version": 1, "slot": "main", "savedAt": …, "realmId": …,
            "serverId": …, "playerActorId": …, "worldTime": …, "chronicleEntries": … },
  "checksum": "fnv1a of the world JSON",
  "presentation": { "sceneId": "blackmere-town", "position": [19, 0] },
  "world": { …complete WorldState… } }
```

Loading rejects a save, and the game starts fresh with a message, when:
- it is not JSON, or the checksum doesn't match (truncated or damaged);
- it is not an Elements of the Realms save;
- its format or schema is newer than this build;
- its player is missing from its world.

Older schemas run through ordered migrations. New empty collections are filled in
without touching existing data.

A world is self-contained: content packs are **not** re-applied on load, so a world's
history is exactly what was saved.

### Returning later
When you come back:
- **Time away:** up to 2 hours of it is simulated on return (Familiars get hungry,
  resources regrow, markets drift).
- **Waiting contracts:** they use the world clock, so a cider-press investment matures
  while you are away.
- **Position:** you reappear where you stood, if that spot is still inside your current
  location.

### In the browser
- **Autosave:** every 30 seconds, when the tab is hidden and when the page closes.
- **K** saves now.
- **L** reloads from the last save (without autosaving over it first).
- **N** starts a new life after a confirmation.
- One save slot (`main`) per browser. If storage is unavailable (private mode), play
  continues, but saves last only for the tab.
