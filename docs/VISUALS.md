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

## Art Pass 2 — characters, Familiars, props

### Characters (`src/render/people.ts`, `realms/happy-fall/looks/blackmere.json`)
Each person is drawn from a **look** (presentation data, validated by `src/render/looks.ts`):
build (slim, average, stout, small, tall), height, skin, hair and hair style, beard,
hat, five colours (garment, over-layer, accent, legs, hat), garment layers, the item in
hand and an idle stance. A new NPC needs a look entry, not code.

| NPC | Silhouette | Layers | In hand | Idle |
|---|---|---|---|---|
| Maren Holloway | stout, headscarf, bun | dress, laced bodice, apron with bib, rolled sleeves, belt pouch | tankard | hands on hips |
| Tobias Quill | tall, wide feathered hat, ponytail, moustache | shirt, button doublet, sash, pack | ledger | holds it up |
| Hester Brindle | stout, straw hat, braid | dress, apron, rolled sleeves, scarf | pitchfork | leaning |
| Pip Ashdown | small, peaked cap, tousled hair | tunic, vest, scarf, satchel stuffed with letters | sealed letter | holds it up |
| Reeve Aldous Crane | tall, tall hat, bald, full grey beard | floor-length robe, tabard with seal, mantle, chain of office | scroll | hands behind back |
| Sela Vantry | slim, hood, long hair | tunic, cloak, sash, bedroll | glowing staff | leaning |
| You | open hood with a tail, ember cloak | tunic, cloak, scarf, belt pouch, **a glowing lantern at the hip** | — | relaxed |

Rig: shoulders and **elbows**, hips, head. Poses blend smoothly: walk and run (arm
swing, torso counter-twist, bob), idle stances with breathing and weight shift,
talking gestures, **turning** (bodies turn at a limited speed and step in place while
turning), **interaction facing** (NPCs turn to face you when you are close or talking;
nearby NPCs follow you with their head), seated and sleeping poses. The player turns
smoothly and faces whoever they are talking to.

### Familiars (`src/render/figures.ts`)
- **Bramble (hound):** ears on pivots (flop when trotting, twitch when idle), a jaw
  that pants with the tongue out when happy or running, a curious head tilt, a wagging
  tail whose speed follows mood. **Sits** and watches you after you stand still a few
  seconds. **Feed:** a bowl appears and she eats, tail going. **Bond:** a play-bow,
  then a happy bounce. **Rest:** lies down, head low.
- **Wick (lantern moth):** lobed wings with eye-spots, feathered antennae, flutter
  speed by mood, brighter halo when fed, a looping spin for joy, settles when resting.
- **Old Corvin (raven):** hops, tilts his head, stretches a wing now and then, caws
  (the lower beak opens), pecks when fed, flaps when pleased, fluffs up to rest.
- Care actions also show a small emote (✿ eat, ♥ bond, z z rest) above the Familiar.

### Props (`src/render/kit/props.ts`, `kit/instancer.ts`)
- **Authored variants** (`variant` on a scene prop, validated per type): stalls by trade
  (produce, bakery, cloth, pottery), crates (produce, closed, stack, empty), barrels
  (water, apples, tap, rain), sacks (tied, open, pile), baskets (apples, pears,
  cabbages, carrots, eggs, empty), benches (plain, backed), tables (set, bare), lamps
  (single, double), fences (rail, picket), carts (broken, loaded, hand), banners (pole,
  wall), wheelbarrows (empty, hay, pumpkins).
- **New props:** stool, basket, bucket, keg rack, tool rack (pitchfork, rake, shovel,
  scythe), wheelbarrow, trough, milestone, multi-arm waymarker.
- **Instancing:** apples, pears, cabbages, carrots, loaves, rolls, pies, cheese,
  bottles, jars, jugs, tankards, gourds, cloth bolts, eggs share one geometry per kind
  and one instanced draw call per kind for the whole section.
- **Placement:** props are grouped into small scenes — each stall with its own trade,
  sign, crates and baskets; the tavern's keg rack, set tables and stools under the
  patrons; the farm's tool corner, trough, wheelbarrows and egg basket; a waymarker at
  the road fork and milestones on the road.

### Budget
Town square on LOW (software rendering): ~410 draw calls, ~129k triangles (Art Pass 1:
~350 and ~105k). Market: ~500 calls, ~152k triangles (was ~405 and ~123k).

## Art Pass 3 — lighting, atmosphere, presentation
- **Light:** warm sun (`lighting.ts` keyframes) over a cool hemisphere (`OUT_SKY`,
  `OUT_GROUND` in `stage.ts`); nights stay moonlit. Interiors use ember-tinted fog
  and a warm hemisphere.
- **Grade:** `GradeShader` in `stage.ts` runs after `OutputPass` on HIGH: clamp,
  split tone (cool shadows, warm lights), gentle S-curve, +10% saturation. LOW uses
  a CSS `filter` on the canvas instead.
- **Grounding:** `contactShadows()` in `builder.ts` instances soft round/boxy decals
  under props; `pathEdges()` blends path borders into grass and adds kerbstones to
  cobble paths. Figures keep their blob shadows (`rig.ts`).
- **Atmosphere (`ambient.ts`):** bird flocks (6–19.5h), mist bands (HIGH,
  `settings.mist`), bunting and banner flutter, extras with `activity`
  (`chat` | `browse` | `stand`) from scene data.
- **Camera:** `stage.follow(target, dt, velocity)` leads in the direction of travel,
  pulls back slightly when running and frames interiors from their bounds.
- **Figures:** `materials.figureKit()` bakes material colours into vertex colours so
  each figure merges into very few draws (trade-off: no cloth weave texture on
  characters).
- **Presets:** LOW — no shadows, no bloom, no grade pass, no mist, half particles.
  HIGH — 2048 shadows, bloom, grade, mist, full particles. Same gameplay either way.
