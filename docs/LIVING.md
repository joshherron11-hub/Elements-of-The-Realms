# Living Blackmere

The depth pass makes Blackmere keep its own hours. This page explains how,
and which parts are rules, which are save data, and which are only presentation.

## The day
- **Calendar** (`realms/happy-fall/living/blackmere.json` → `calendar`): one in-game day
  lasts 24 real minutes, and a new world starts at 09:00 on Day 1. Game time is a pure
  function of the world's `createdAt` and the injected `Clock` (`gameTime()` in
  `src/world/living.ts`). PROVISIONAL.
- The HUD shows the clock ("Day 1 · 09:00 · Morning"), and the scene's light follows it:
  gold mornings, ember dusk, ink-violet nights with lit windows and lamps
  (`src/render/lighting.ts`). Interiors keep their own warm light.

## Rules (data, not saves)
The living-world file is **rules**: it is loaded with the content and is not written into
saves, so a world saved before this pass picks up routines and reactions on load.

| Section | What it does | Service |
|---|---|---|
| `routines` | Each NPC's day: hours, location, activity and activity spot. Every hour 0–23 must be covered. | `RoutineService` (`src/world/routines.ts`) |
| `markets` | Opening hours and the morning restock targets per market. Buying or selling while closed returns `MARKET_CLOSED`. | `MarketService.isOpen` / `restock` |
| `stall` | Player-stall sale odds, price ceiling, customer hours and the catch-up cap. | `StallService` (`src/economy/stall.ts`) |
| `npcLines` | Activity greetings, warmer lines for people who like you, merchant barks. | `ModeService.greetingFor` |
| `familiarReactions` | Personality lines per species or per individual Familiar. | `FamiliarService.reaction` |

Routines are deterministic (they read only the clock), emit `npc.routine` with no
Chronicle entry and no evidence: an innkeeper going to bed is not history and says
nothing about anyone's identity. Lines are picked with a hash (`pickLine`), so they
consume no randomness.

## Player state (saved)
- `npcActivity`: what each NPC is doing now (recomputed every tick anyway).
- `stalls`: your listings, takings and the last hour processed.
- `Market.lastRestockDay`.
Old saves get empty defaults from `normalizeWorld`.

## Your market stall
Own *Market Stall No. 4* and stand at it (east side of the market). Lay out goods you
carry at a fair price (the lowest market price) or a dear one (×1.5). While the stall's
hours run (07:00–19:00), off-screen customers buy one unit per hour with a chance that
falls as your price rises and is zero at 2.5× the fair price. Rolls use the seeded world
RNG, so a world always sells the same way. Each sale is a ledgered `stall sale` mint, a
Chronicle entry, and a toast. Hours away are caught up when you return (up to 48).

## Your home
*Wicket Cottage* (Hearth Row, 160 mk from the Reeve) has its own interior. Its door is
locked to anyone but the owner (authority check `property.enter`). Resting a Familiar
at home restores more energy and mood.

## Presentation only
Nothing below changes the world; it reads state and sends intents.
- NPC figures walk to their routine spot, wander a little while idle, lie down asleep,
  walk out through the nearest exit when their routine takes them elsewhere, and walk
  in from one when it brings them here. Two people at one spot sit side by side.
- Familiars follow the path you walked, potter and sniff around you when you stop,
  catch up if left behind, and show reactions in speech bubbles.
- Townsfolk, tavern patrons, a cat, hens, sheep and crows; falling leaves, chimney
  smoke, fireflies at night, swaying banners, flickering hearths, shimmering water and
  parallax backdrops (`src/render/ambient.ts`).
- Readable signs, boards and deeds. The notice board, the tavern rumour slate, the price
  board and deeds are written from live state (`src/ui/feedback.ts`).
- Relationship labels (Stranger … Close friend, Wary, Hostile) are per person, never a
  rank. Merchant barks, floating coin numbers, an objectives tracker and a minimap.
- Sound cues mapped from events (`src/ui/sound.ts`); a WebAudio synth plays them. Muted
  until you press **M** or the ♪ button.
- Click or tap to walk; tap a person to walk up and talk; tap a sign, stall or resource
  to use it. On phones and narrow screens: joystick, action buttons and bottom-sheet panels.
