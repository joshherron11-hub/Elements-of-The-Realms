# Blackmere visuals — Chromatic Mythic 2.5D

Presentation only. Nothing in this page changes the simulation; every file
lives in `src/render` or `src/ui`, or in scene layout data.

## Screen and camera
- **Full viewport**: the canvas fills the window (`100dvh`, safe-area aware) and
  resizes with a `ResizeObserver`, so there is no dead space and phone browser bars
  don't leave gaps.
- **Camera** (`src/render/stage.ts`): elevated three-quarter view at 39° (54° indoors),
  closer than before, framing the player low-centre so you see where you're going.
  Portrait screens open the lens and pull back slightly. The view is clamped to the
  section so you don't look into empty space. **Mouse wheel / pinch / + −** zoom
  (0.7×–1.4×).

## Light and colour
- Warm key light against a cool violet fill (`HemisphereLight` ground colour), with
  the fill kept low so shapes read in three hard cel bands (deep shadow, mid, light).
- **Rim light** on characters and Familiars (`Materials.character`): warm by day, cool
  moonlight at night, hearth-gold indoors.
- Painted **gradient sky dome** with a warm horizon band; fog matches the hour.
- Glow materials (windows, lanterns, fire, the moth Familiar) are over-bright; with
  **bloom** on (HIGH) only they bloom, because the threshold sits above 1.
- Palette keys `meadow` and `cobble` (in `realm.json`) separate grass from walkways.

## World dressing
- Painted procedural textures (`src/render/textures.ts`): blotchy autumn ground with
  leaves, cobbles, packed-earth roads, floorboards. No image assets.
- Paths get a darker kerb so they read as walkways.
- **Instanced scatter** of grass tufts, pebbles and leaf drifts (three draw calls),
  kept off paths, water, exits and solid props.
- **Surroundings**: a ring of instanced autumn trees beyond the walkable edge, and low
  hedges on the camera side as a foreground layer. The land continues into the fog.
- Timber-framed houses with plinths, beams, lit windows, gable roofs and chimneys;
  striped market awnings with wares; a notice board with pinned notes; lanterns with
  night halos; bunting; woodpiles; sacks; pumpkins; planters; bushes.
- Interiors are dioramas: the wall nearest the camera is cut down to a sill; rooms
  have wainscot, beams, floorboards, hanging lanterns that light the room, and embers.

## Characters
- Bigger (≈2.5 m), chunky proportions with oversized heads; limbs on pivots.
- Each role has a silhouette: hooded cloak and scarf (you), headscarf and apron
  (innkeeper), wide feathered hat and pack (merchant), straw hat (farmer), cap and
  satchel (courier), tall hat and gold chain in a long robe (Reeve), hood and glowing
  staff (traveller).
- Animation (`animateFigure`): walk and run cycles, idle breathing and glancing,
  gestures while talking, lying down asleep, seated patrons sipping.
- Familiars: trotting hound with a wagging tail and a sniffing nose; the moth flaps
  and glows; the raven hops and flaps. After care they show **joy** (a hop, spin or
  fast wag) as well as a speech bubble.
- Every figure has a soft ground shadow (works on LOW, where real shadows are off).

## Particles
Falling leaves, dust motes in the light, chimney smoke puffs, hearth embers and night
fireflies. Counts scale with the graphics preset.

## Graphics presets (`src/render/quality.ts`)
| | LOW | HIGH |
|---|---|---|
| Pixel ratio cap | 1.25 | 2 |
| Real-time shadows | off | 2048² soft shadow map following the player |
| Bloom | off | selective (over-bright only) |
| Scatter / particles | half | full |

Phones, touch devices, ≤4-core or ≤4 GB machines and narrow windows start on LOW.
Toggle with **G** or the *Graphics* button; the choice is remembered per browser.

## UI
Bundled typefaces (Cinzel for titles, Alegreya for text; SIL OFL, served with the game).
Layered panels with an ember-gold rule, status card with chips, a segmented mode bar,
key-badge prompts, name plates, speech bubbles with tails, a minimap with building
blocks and a caption, a vignette, and a phone layout with joystick, action buttons,
a scrollable mode bar and bottom-sheet panels.

## Art kit (Art Pass 1)
Every visible object is built from the art kit in `src/render/kit/`, not from raw primitives.

- **Geometry** (`kit/geo.ts`): turned profiles (`lathe`), softened boards (`board`),
  extruded outlines (`slab`, `slabShape`), bent rods (`tube`), faceted clusters
  (`cluster`), seeded hand-made `jitter`, radial `ribbed` folds, and world-scaled
  `projectUv` so every texture keeps one scale. `Assembly` merges all parts of a prop
  that share a material into one mesh and draws one crack-free ink outline from
  smoothed outline normals.
- **Materials** (`Materials`): `wood`, `stone`, `plaster`, `shingle`, `straw`, `weave`
  (burlap and cloth), `metal`, `painted` (signs, banners, rugs), `glow` (glass and
  fire, optionally leaded), `character` (rim-lit, optionally textured).
- **Painted surfaces** (`textures.ts`): wood grain, end grain, barrel staves, stone
  courses, plaster, shingles, straw, weave, stripes, rug, leaded lattice, paper notices,
  lettered signboards with emblems, banner devices, runes, and ground decals (exit
  chevrons, gather glints, tap target), plus a leaf sprite.
- **Props** (`kit/props.ts`): every prop type is a crafted model; collision still
  comes only from layout footprints.
- **Characters** (`figures.ts`): turned tunics with folds, sleeves and trousers,
  booted feet, mitten hands, faces with eyes, brows, nose, ears, cheeks and mouth,
  six hair styles, role hats and gear; shaped Familiars and animals. The animation
  rig is unchanged.

Budget (town square, LOW): ~350 draw calls (unchanged by merging), ~105k triangles,
29 textures. Measured in software rendering; real-GPU profiling is still to do.
