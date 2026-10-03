# Blackmere

The first playable location in Happy Fall. Simulation content lives in
`realms/happy-fall/content/10-blackmere.json`. Presentation layouts live in
`realms/happy-fall/scenes/*.json`.

## Areas and sections
The world is continuous in history, not necessarily in geometry. Blackmere is drawn as
three walkable sections connected by exits.

| Section | Locations (zones) |
|---|---|
| `blackmere-town` | Town Square · Blackmere Market · Hearth Row (residential) · Keep Gatehouse (inner Keep visible, gate shut) |
| `blackmere-tavern` | The Lantern & Ladle (interior) |
| `blackmere-outskirts` | The East Road · Brindle Farm Edge · Hollowmere Woodland Edge |

Exits: the tavern door joins the Square and the tavern, and the east gate joins the
Market and the East Road.

```
                Keep Gatehouse
                      |
 Hearth Row — Town Square — Market — East Road — Brindle Farm Edge
                      |                  \             |
          The Lantern & Ladle             Hollowmere Woodland Edge
```

## People
| Role | Name | Where | Notes |
|---|---|---|---|
| Innkeeper | Maren Holloway | The Lantern & Ladle | sells bread and cider |
| Merchant | Tobias Quill | Market | Quill's Sundries: buys apples and timber, sells oil, wool and Familiar supplies |
| Farmer | Hester Brindle | Brindle Farm Edge | orchard nearby |
| Courier | Pip Ashdown | Town Square | |
| Local official | Reeve Aldous Crane | Keep Gatehouse | keeps the property records |
| Traveler | Sela Vantry | The Lantern & Ladle | |

All names, dialogue and visuals are original placeholders. Contracts, property and
social events are listed in `docs/ECONOMY.md`.

## How the browser game stays out of the rules
- **Walking** is presentation-only, with positions inside a section. Crossing into
  another zone sends a `travel` intent. If the kernel rejects it, the player is put back.
- **Exits** send `travel` to the destination location, and the new section loads only
  if the kernel accepts.
- **E** near a person sends `talk`. The dialogue panel offers that person's contracts,
  wares and hand-ins, all as intents and greyed out when the current mode doesn't
  allow them. **E** near a resource sends `gather`, and **F** sends `search`.
- **1–6** switch between the implemented modes.

## Controls
WASD / arrows move · Shift run · E interact · F search · I inventory · J journal ·
1–6 modes · Esc close

## Rendering
Toon materials with three bands, inverted-hull outlines, painted canvas backdrops on
far planes for 2.5D layering, an elevated three-quarter follow camera and HTML name
labels. The colours come from the Realm's art direction metadata. There are no
shadows and no external assets.
