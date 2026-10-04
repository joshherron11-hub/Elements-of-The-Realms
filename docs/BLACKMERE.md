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
WASD / arrows or click/tap to move · Shift run · E interact (talk, read, gather, tend
stall) · F search · I inventory · J journal · C companions · 1–6 modes · M sound · Esc close.
Phones get a joystick and action buttons. See [`LIVING.md`](LIVING.md) for routines,
the stall, Wicket Cottage, ambient life and feedback.

## Rendering
Cel-shaded materials with rim light, inverted-hull outlines, painted procedural
textures, painted backdrops and an instanced tree ring for 2.5D depth, a full-viewport
three-quarter follow camera, and HTML name plates. Colours come from the Realm's art
direction metadata. Real-time shadows and bloom are on the HIGH preset only; there
are no image assets. Light follows the in-game hour (`src/render/lighting.ts`);
ambient life comes from `src/render/ambient.ts`. Full detail in [`VISUALS.md`](VISUALS.md).
