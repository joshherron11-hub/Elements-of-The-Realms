# Familiars

A Familiar can be a **companion**, a **collectible**, a **utility** creature, a
**historical object**, a **relationship entity** or a **cultural/political symbol**.
Familiars use the shared kernel: each is an actor in the world, an asset in the
ownership registry (`kind: 'familiar'`) and a subject of Chronicle history.

> **Owning a Familiar never defines Canonical Recognition.** `src/familiars` has no
> dependency on identity or Canonical code (enforced by `tests/architecture.test.ts`).
> Care actions are recorded only as raw, `system-observed` interactions, and
> `tests/familiars.test.ts` checks that the Canonical stores stay empty.

## Data
Species and individual Familiars are content (`realms/happy-fall/content/30-familiars.json`).

| Field | Where |
|---|---|
| species, role, diet, decay rates, follows owner, utility tags, default Realm form, figure | `FamiliarSpecies` |
| name, variant, temperament, bond, care state, individual Realm forms, utility tags, provenance, history, optional offer | `Familiar` |
| owner | ownership registry, never on the Familiar |

`formIn(familiar, realmId)` gives a Familiar's appearance in a Realm. Cross-Realm travel
uses these forms (`form-shift`, see `docs/REALMS.md`).

## Happy Fall's first Familiars
| Name | Species | Role | Keeper | Notes |
|---|---|---|---|---|
| **Bramble** | Russet Hound | companion | Hester Brindle, Brindle Farm | 12 mk; the dog-like companion for peaceful players; follows you; eats Hound Biscuits |
| **Wick** | Lantern Moth | collectible / light | Sela Vantry, the tavern | 18 mk; glows; eats Seed Cake |
| **Old Corvin** | Keep Raven | civic symbol / historical | Blackmere Town Council | not for sale; stays at the Keep |

## Care loop
| Action | Intent | Effect |
|---|---|---|
| **Feed** | `feed-familiar` | Uses one item matching the diet. Satiety +35, mood +5, bond +2 if they were hungry. Refused if satiety ≥ 95 or the food is wrong. |
| **Rest** | `rest-familiar` | Energy +50, mood +3. Refused if already rested. |
| **Bond** | `bond-familiar` | Bond +6 and mood +10, once per 5 minutes. Refused if exhausted or starving. |
| **Status** | `familiar-status` | Bond, care values and plain-language notes ("peckish", "lively"). |
| **Acquire** | `acquire-familiar` | Pays the keeper through the economy, transfers ownership, and resets the bond to 5. |

Over simulated time, satiety and energy fall at each species' rates and mood drifts
toward their average. A starving Familiar slowly loses bond. All of this is
deterministic.

Chronicled events (they also join the Familiar's own `history`):
- acquisition;
- bond milestones at 25, 50, 75 and 100.

Feeding, resting and play are everyday life, so they become raw evidence but not
history.

Modes: Live can acquire, feed and check status. Companion adds rest and bond.

## Presentation
- Hound, moth and raven figures are original placeholder geometry. An owned follower
  trots after you, and the moth floats and glows.
- Talking to a keeper lists "Companions looking for a home".
- **C** opens the Companions panel with care values and Feed / Rest / Spend time
  together buttons, greyed out with a hint when the current mode doesn't allow them.
