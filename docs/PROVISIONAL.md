# Provisional Placeholders Register

Everything listed here is a **provisional placeholder**. None of it is Canon, and all of
it can change. Values that live in data change by editing JSON, with no code changes.

**Approved names (keep):** *Happy Fall*, *Blackmere*.

| What | Where | Notes |
|---|---|---|
| NPC names and dialogue (Maren Holloway, Tobias Quill, Hester Brindle, Pip Ashdown, Reeve Aldous Crane, Sela Vantry) | `realms/happy-fall/content/10-blackmere.json` | original placeholder names |
| Place names inside Blackmere (The Lantern & Ladle, Hearth Row, Brindle Farm Edge, Hollowmere Woodland Edge, East Road, Keep Gatehouse) | `10-blackmere.json` | Blackmere itself is approved |
| Currency (Mark, `mk`) and the starting purse (40) | `00-economy.json`, `realm.json` → `constitution.economy` | |
| Items, item values, market prices and spreads | `00-economy.json`, `10-blackmere.json` | |
| Contract rewards, stakes, the cider-press wait (60 s) | `20-blackmere-life.json` | |
| Risk outcome weights and multipliers; market drift period (2 min) | `00-economy.json`, `10-blackmere.json` | |
| Property values (stall 30, cottage 160) | `20-blackmere-life.json` | |
| Organizations, clan and faction placeholders | `20-blackmere-life.json` | |
| Familiar names, prices, care decay rates | `30-familiars.json` | |
| Bond gain, bond cooldown, feed and rest amounts, new-owner bond | `src/familiars/familiars.ts` (constants) | the only gameplay numbers in code; candidates to move to data |
| Values of every server preset except PEACEFUL | `server-constitutions/*.json` | PEACEFUL is owner-specified |
| AI allowances (50k tokens/day, cost cap), rate limits (10/min/user, 120/min global) | `src/ai/service.ts` | |
| Time-away catch-up cap (2 h), autosave interval (30 s), walk/run speeds | `src/ui/session.ts`, `src/main.ts`, `src/ui/game.ts` | |
| Day length (24 real minutes), start hour (09:00), NPC routines, market hours and restock targets, stall odds (35 %/h, ceiling ×2.5, 07–19, 48 h catch-up), NPC lines and Familiar reactions | `realms/happy-fall/living/blackmere.json` | rules, not saves: changes apply to old worlds too |
| Home rest bonus (+80 energy), NPC walk speed, idle radius, tap and read ranges | `src/familiars/familiars.ts`, `src/ui/game.ts` | |
| Visual tuning: camera pitch/distance/zoom range, rim strength, preset thresholds (cores, memory, width), scatter and particle counts, palette keys `meadow` and `cobble` | `src/render/stage.ts`, `materials.ts`, `quality.ts`, `builder.ts`, `ambient.ts`, `realm.json` | presentation only |
| Recognition ladder numbers | `src/identity/canonical/ladder.ts` | **TEST_ONLY** fixtures, see `docs/CANONICAL.md` |

Each content file carries a `$provisional` note. The game ignores keys that start with `$`.

## Changing a placeholder
- **New worlds** pick up changes immediately.
- **Already-saved worlds** keep the values they were founded with, because a saved
  world is a self-contained history (see `docs/CHRONICLE_AND_SAVES.md`). Applying a
  changed price or reward to existing saves needs a content refresh step. That is a
  backlog item, not a rewrite.
