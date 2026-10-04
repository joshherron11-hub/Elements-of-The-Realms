# Character pipeline (Blackmere humanoids)

Blackmere people are moving from built-in-code figures (`src/render/people.ts`)
to **rigged, skinned humanoid models** loaded from GLB. This is presentation
only: a model is attached to an existing NPC (or extra) through its look; NPC
identity, routines, economy, Chronicle and saves are untouched.

Status: **reference milestone.** One character (Pip Ashdown, the courier by the
well in Town Square) uses the new pipeline. A placeholder townsperson
(`extra_market-runner`) stands beside him for comparison. Other NPCs keep the old
figures until the reference is approved.

## Asset
`assets/characters/blackmere-humanoid.glb` (+ `.manifest.json`), built by
`tools/characters/build.py`:

```bash
pip install "bpy==4.5.*" scikit-image     # headless Blender as a Python module
python tools/characters/build.py          # ~5 min cold, ~2 min with the mesh cache
EOTR_ONLY=hat_flatcap python tools/characters/build.py   # re-mesh just one part
```

| Step | File |
|---|---|
| Proportions, skeleton, sculpted body, head and hands (signed distance fields) | `tools/characters/anatomy.py` |
| Modular parts: clothes as offsets of the body with folds, hems, cuffs, seams | `tools/characters/outfit.py` |
| SDF primitives, smooth booleans, marching cubes | `tools/characters/sdf.py` |
| Skeleton and skin weights | `tools/characters/rig.py` |
| Animation library (authored poses → keyframes) | `tools/characters/anims.py` |
| Blender helpers (decimate, LODs, UVs, export) | `tools/characters/blend.py` |
| Dev viewer: `npm run dev` → `/tools/characters/viewer/?clip=walk&t=0.25` | `tools/characters/viewer/` |

- **Format:** glTF 2.0 binary. One shared skeleton, every part at three LODs, and all clips.
- **Skeleton:** 32 bones (27 deforming): root, hips, spine, chest, neck, head, jaw; per side shoulder, upper arm, forearm, hand, fingers, thumb, thigh, shin, foot, toe; sockets `socket_hand.L/.R`, `socket_back`, `socket_hip.L/.R` for held items now and weapons later.
- **Skinning:** up to 4 influences per vertex. Weights come from per-bone distance fields, limited to neighbouring bones. Skirts blend toward the hips.
- **Surface:** no texture unwrap.
  - UV.x = palette slot (skin, lips, hair, brow, sclera, iris, pupil, top, top_trim, over, accent, legs, leather, sole, metal, hat).
  - UV.y = ambient occlusion baked in the rest pose.
  - Fine detail is a 128² channel-packed texture (weave, leather, hair strands, skin), sampled triplanar in bind-pose space.
  - Every NPC shares meshes and one shader program; colours come from the look.
- **LODs:** 100% / 42% / 16% (Pip costume ≈ 21.2k / 8.9k / 3.4k triangles). They switch at 36/62 world units on HIGH and 27/46 on LOW; the gameplay camera sits ~21 units away.

## Parts
Categories: body (segments: neck, torso, arms_upper, arms_lower, legs_upper,
legs_lower, feet), head, eyes, brows, hands, hair, hat, top, over, belt, bottoms,
boots, neck, bag.

- A part lists the body segments it `hides`, so covered skin is not drawn.
- A hat swaps any hair for its `<hair>_hat` variant.
- The reference set: `head_a`, `eyes_a`, `brows_a`, `hands_base`, `hair_tousled` (+`_hat`), `hat_flatcap`, `top_tunic`, `over_vest`, `belt_plain`, `bottoms_trousers`, `boots_cuffed`, `neck_scarf`, `bag_satchel`.

New faces, hair, facial hair, robes, coats, gloves and occupation accessories are
new functions in `outfit.py` (the same sculpt → mesh → skin path), then names in
look data.

## Runtime (`src/render/characters/`)
- `library.ts`: loads GLBs and remaps joints to one bone order. It merges a costume's parts into **one skinned geometry per LOD**, cached so NPCs wearing the same parts share it, and builds a fresh skeleton per character.
- `humanoid.ts`: builds the character (LOD group, optional skinned ink outline, blob shadow) and runs the AnimationMixer. It maps the existing `PoseInput` to clips with cross-fades and layers head look on top.
- `material.ts`: the palette, occlusion and detail shader, plus the skinned outline.
- `index.ts`: `createCharacter` picks the model when the look names one and the asset has loaded; otherwise it falls back to the built figure. It also maps routine activities to gestures (deliveries → carry, chores → work, sorting/serving → interact).

Looks data:

```json
"model": { "asset": "blackmere-humanoid", "parts": ["body_base", "head_a", "..."], "palette": { "iris": "#4a2c1a" } }
```

Clips: idle, walk, run, turn, talk, interact, sit, carry (an upper-body layer),
work, celebrate, sleep. To add a clip, add a function to `anims.py` and a case in
`chooseClip`. Combat clips need no new system.

`?models=off` keeps the built figures (A/B comparison, very weak devices).

## What becomes obsolete once the population is converted
- `src/render/people.ts`: `createPerson`, `createFigure`, `lookFromStyle`'s geometry, `animatePerson` and `STANCES`.
- In `src/render/rig.ts`, the person-specific parts of `Rig`/`PoseInput` handling (the familiar and animal rigs stay).
- `Materials.figureKit` / `characterVC` and the vertex-colour bake mode of `Assembly`, which exist only for built figures.
- In `looks.ts`, the `garments`/`hairStyle`/`hat`/`beard`/`held` fields become part lists. Colours stay as the palette source.
