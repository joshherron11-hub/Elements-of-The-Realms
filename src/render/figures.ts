import * as THREE from 'three';
import type { Materials } from './materials';
import { softDisc, weaveTexture } from './textures';
import { board, cluster, hash, jitter, lathe, ribbed, slab, tube, type Assembly, type V3 } from './kit/geo';

/**
 * Characters and Familiars for Chromatic Mythic: original designs, no external
 * assets. Bodies are turned and shaped (lathe tunics with folds, tapered
 * sleeves and trousers, booted feet, mitten hands), heads carry faces, hair and
 * a role hat, and everything is cel-shaded with a rim light and an ink line.
 *
 * Every figure is a root group (position + facing) holding a soft ground
 * shadow and a `rig` (pose). Animation moves the rig only, so the shadow stays
 * on the ground whatever the pose.
 */
export type Role = 'player' | 'innkeeper' | 'merchant' | 'farmer' | 'courier' | 'official' | 'traveler' | 'villager' | 'patron';

export interface FigureStyle {
  body: number;
  accent: number;
  skin?: number;
  hair?: number;
  height?: number;
  role?: Role;
}

interface Rig {
  rig: THREE.Group;
  head?: THREE.Object3D;
  armL?: THREE.Object3D;
  armR?: THREE.Object3D;
  legL?: THREE.Object3D;
  legR?: THREE.Object3D;
  tail?: THREE.Object3D;
  /** Four-legged: diagonal pairs [0,1] and [2,3] move together (a trot). */
  legs?: THREE.Object3D[];
  wings?: THREE.Object3D[];
  kind: 'person' | 'hound' | 'moth' | 'raven' | 'animal';
  seed: number;
}

const SKIN = [0xe7c39a, 0xc99a6e, 0x9c6b48, 0xf0d2b0, 0xb07a52];
const HAIR = [0x3a2416, 0x6b3a1e, 0xc9a060, 0x2a1a1a, 0x8a4a2a, 0xb8b0a4];
const LEATHER = 0x3a2416;

function shadowDisc(radius: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: softDisc(), color: 0x120a14, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.renderOrder = 1;
  m.name = 'blob-shadow';
  return m;
}

function rigOf(g: THREE.Object3D): Rig | undefined {
  return g.userData.rig as Rig | undefined;
}

/** Repeat a lathe's own UVs so cloth weave reads at body scale. */
function uvScale(geo: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

/** Cloth: rim-lit cel material with a fine weave. */
const cloth = (m: Materials, color: number) => m.character(color, weaveTexture());

/** Scale a 2D outline by k. */
const sc = (pts: [number, number][], k: number) => pts.map(([x, y]) => [x * k, y * k] as [number, number]);

// ── People ───────────────────────────────────────────────────────────────────

/** A face: eyes with a catch-light, brows, a nose, ears, cheeks, a mouth. */
function face(a: Assembly, m: Materials, k: number, skin: number, brow: number, seed: number): void {
  const R = 0.34 * k;
  a.add(new THREE.SphereGeometry(R, 16, 12), m.character(skin), { s: [1, 1.08, 1] });
  a.add(new THREE.SphereGeometry(0.075 * k, 8, 6), m.character(skin), { p: [0, -0.02 * k, R * 0.98], s: [0.8, 0.75, 1] }, { outline: false });
  for (const x of [-1, 1]) {
    a.add(new THREE.SphereGeometry(0.075 * k, 8, 6), m.character(skin), { p: [x * R * 0.98, 0, 0], s: [0.5, 1, 0.8] }, { outline: false });
    a.add(new THREE.SphereGeometry(0.052 * k, 8, 6), m.toon(0x1a1014), { p: [x * 0.12 * k, 0.06 * k, R * 0.9], s: [0.8, 1.15, 0.5] }, { outline: false });
    a.add(new THREE.SphereGeometry(0.016 * k, 5, 4), m.glow(0xffffff, 1), { p: [x * 0.12 * k + 0.015 * k, 0.085 * k, R * 0.93] }, { outline: false });
    a.add(board(0.12 * k, 0.03 * k, 0.03 * k), m.toon(brow), { p: [x * 0.13 * k, 0.17 * k, R * 0.86], r: [0, 0, x * (-0.15 + (hash(seed) - 0.5) * 0.3)] }, { outline: false });
    a.add(new THREE.CircleGeometry(0.05 * k, 8), m.toon(0xe0907a), { p: [x * 0.2 * k, -0.07 * k, R * 0.84], r: [0, x * 0.5, 0] }, { outline: false });
  }
  a.add(board(0.1 * k, 0.022 * k, 0.02 * k), m.toon(0x6a2a24), { p: [0, -0.14 * k, R * 0.92] }, { outline: false });
}

/** Hair styles: 0 cropped, 1 long, 2 bun, 3 braid, 4 bald with beard, 5 cropped with beard. */
function hair(a: Assembly, m: Materials, k: number, color: number, style: number, seed: number): void {
  const R = 0.36 * k;
  const mat = m.character(color);
  if (style !== 4) {
    a.add(jitter(new THREE.SphereGeometry(R, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), 0.03 * k, seed), mat, { p: [0, 0.03 * k, -0.02 * k], s: [1.04, 1.06, 1.06] });
    a.add(cluster([[-0.15 * k, 0, 0, 0.11 * k], [0, 0.02 * k, 0, 0.12 * k], [0.15 * k, 0, 0, 0.11 * k]], seed), mat, { p: [0, 0.2 * k, 0.24 * k] }, { outline: false });
  }
  if (style === 1) a.add(jitter(lathe(sc([[0.3, 0], [0.34, -0.25], [0.28, -0.5], [0.0, -0.55]], k), 10), 0.02 * k, seed), mat, { p: [0, 0.05 * k, -0.08 * k], s: [1, 1, 0.7] });
  if (style === 2) a.add(new THREE.SphereGeometry(0.15 * k, 8, 6), mat, { p: [0, 0.22 * k, -0.3 * k] });
  if (style === 3) a.add(tube([[0, 0, -0.3 * k], [0.05 * k, -0.25 * k, -0.36 * k], [0.02 * k, -0.6 * k, -0.3 * k]], 0.07 * k, 8, 6), mat);
  if (style === 4 || style === 5) a.add(cluster([[0, 0, 0, 0.16 * k], [-0.1 * k, 0.05 * k, -0.02 * k, 0.12 * k], [0.1 * k, 0.05 * k, -0.02 * k, 0.12 * k]], seed), mat, { p: [0, -0.24 * k, 0.24 * k] });
}

/** A whole person. Height ~2.5 m in world units: big enough to read on a phone. */
export function createFigure(m: Materials, style: FigureStyle): THREE.Group {
  const P = m.palette;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const h = style.height ?? 2.5;
  const k = h / 2.5;
  const role = style.role ?? 'villager';
  const seed = (style.body % 97) + (style.accent % 13) * 7 + Math.round(h * 10);
  const skin = style.skin ?? SKIN[seed % SKIN.length]!;
  const hairColor = style.hair ?? HAIR[(seed >> 1) % HAIR.length]!;
  const robe = role === 'official';
  const skirt = role === 'innkeeper';
  const L = (pts: [number, number][]) => sc(pts, k);

  // Legs: tapered trousers and shaped boots, pivoting at the hip.
  const legLen = 0.66 * k;
  const hip = 0.98 * k;
  const leg = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, hip, 0);
    const a = m.kit(0.03);
    if (!robe) a.add(uvScale(lathe(L([[0.1, -0.66], [0.12, -0.45], [0.15, -0.12], [0.16, 0]]), 10), 3, 1), cloth(m, role === 'player' ? 0x4a3a30 : P.timber));
    const boot: [number, number][] = [[-0.12, 0], [0.24, 0], [0.29, 0.06], [0.22, 0.13], [0.08, 0.15], [0.07, 0.34], [-0.12, 0.34]];
    a.add(slab(L(boot), 0.22 * k, 0.02 * k), m.character(LEATHER), { p: [0, -legLen - 0.06 * k, 0.02 * k], r: [0, -Math.PI / 2, 0] });
    pivot.add(a.build());
    return pivot;
  };
  const legL = leg(-0.17 * k);
  const legR = leg(0.17 * k);
  rig.add(legL, legR);

  // Torso: a turned tunic with folds (a long robe for the Reeve, a skirt for the innkeeper).
  const body = m.kit(0.045);
  const hem = robe ? -0.95 : skirt ? -0.72 : -0.28;
  const flare = robe ? 0.6 : skirt ? 0.56 : 0.48;
  const torso = ribbed(lathe(L([[flare, hem], [flare * 0.92, hem + 0.12], [0.44, 0], [0.38, 0.28], [0.43, 0.56], [0.45, 0.7], [0.36, 0.82], [0.16, 0.9], [0.0, 0.9]]), 16), 8, 0.03);
  body.add(uvScale(torso, 4, 2), cloth(m, style.body), { p: [0, hip, 0] });
  body.add(new THREE.TorusGeometry(0.41 * k, 0.05 * k, 6, 20), m.character(LEATHER), { p: [0, hip + 0.1 * k, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.85, 1] }, { outline: false });
  body.add(board(0.13 * k, 0.11 * k, 0.04 * k), m.metal(0xc9973a), { p: [0, hip + 0.1 * k, 0.36 * k] }, { outline: false });
  body.add(lathe(L([[0.13, 0], [0.12, 0.16]]), 10), m.character(skin), { p: [0, hip + 0.86 * k, 0] }, { outline: false });
  // Shoulders: a short collar / mantle in the accent colour.
  body.add(uvScale(lathe(L([[0.5, -0.12], [0.47, -0.02], [0.36, 0.08], [0.18, 0.12]]), 14), 4, 1), cloth(m, style.accent), { p: [0, hip + 0.78 * k, 0] });

  const shoulder = hip + 0.76 * k;
  const arm = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, shoulder, 0);
    const a = m.kit(0.03);
    a.add(uvScale(lathe(L([[0.13, -0.62], [0.12, -0.55], [0.1, -0.3], [0.13, -0.05], [0.12, 0.05]]), 10), 3, 1), cloth(m, style.body));
    a.add(new THREE.SphereGeometry(0.1 * k, 10, 8), m.character(skin), { p: [0, -0.72 * k, 0.02 * k], s: [1, 1.1, 0.8] });
    a.add(new THREE.SphereGeometry(0.04 * k, 6, 5), m.character(skin), { p: [x > 0 ? -0.07 * k : 0.07 * k, -0.68 * k, 0.07 * k] }, { outline: false });
    pivot.add(a.build());
    pivot.rotation.z = x > 0 ? 0.1 : -0.1;
    return pivot;
  };
  const armL = arm(-0.46 * k);
  const armR = arm(0.46 * k);
  rig.add(armL, armR);

  // Head: face, hair and the role hat.
  const headY = shoulder + 0.42 * k;
  const head = new THREE.Group();
  head.position.y = headY;
  const ha = m.kit(0.035);
  face(ha, m, k, skin, hairColor === 0xb8b0a4 ? 0x7a7068 : 0x2a1a12, seed);
  const hairStyle = role === 'official' ? 4 : role === 'innkeeper' ? 2 : role === 'farmer' ? 3 : role === 'merchant' ? 5 : seed % 4;
  if (role !== 'player' && role !== 'traveler') hair(ha, m, k, role === 'official' ? 0xb8b0a4 : hairColor, hairStyle, seed);
  const hat = (o: THREE.BufferGeometry, color: number, at: V3, opts: { r?: V3; map?: THREE.Texture } = {}) => ha.add(o, m.character(color, opts.map), { p: at, r: opts.r });

  switch (role) {
    case 'player': {
      // A pointed hood with a soft fold, a travelling cloak and a scarf.
      // A rounded hood with a soft drooping tail, framing the face — not a cone.
      const hood = jitter(lathe(L([[0.42, -0.2], [0.46, 0.02], [0.44, 0.24], [0.36, 0.42], [0.22, 0.54], [0.08, 0.6], [0.0, 0.6]]), 16), 0.015 * k, seed);
      hat(uvScale(hood, 3, 1), style.accent, [0, 0.04 * k, -0.06 * k], { r: [-0.15, 0, 0], map: weaveTexture() });
      ha.add(tube([[0, 0.5 * k, -0.2 * k], [0, 0.52 * k, -0.42 * k], [0.04 * k, 0.32 * k, -0.6 * k], [0.06 * k, 0.1 * k, -0.62 * k]], 0.075 * k, 10, 6), m.character(style.accent, weaveTexture()));
      ha.add(new THREE.TorusGeometry(0.36 * k, 0.06 * k, 6, 18, Math.PI * 1.3), m.character(new THREE.Color(style.accent).multiplyScalar(0.75).getHex()), { p: [0, 0.02 * k, 0.2 * k], r: [0, 0, -Math.PI * 0.15] }, { outline: false });
      const cape = new THREE.CylinderGeometry(0.44 * k, 0.6 * k, 1.15 * k, 16, 1, true, Math.PI * 0.55, Math.PI * 0.9);
      body.add(uvScale(cape, 3, 2), m.character(style.accent, weaveTexture()), { p: [0, hip + 0.3 * k, -0.04 * k], r: [0, Math.PI, 0] }, { outline: false });
      body.add(new THREE.TorusGeometry(0.28 * k, 0.1 * k, 8, 16), cloth(m, P.gold), { p: [0, shoulder + 0.1 * k, 0], r: [Math.PI / 2, 0, 0] });
      body.add(slab(L([[-0.08, 0], [0.08, 0], [0.06, -0.4], [-0.06, -0.38]]), 0.04 * k), cloth(m, P.gold), { p: [0.14 * k, shoulder + 0.05 * k, 0.32 * k], r: [0.2, 0, 0.15] }, { outline: false });
      break;
    }
    case 'innkeeper': {
      hat(new THREE.TorusGeometry(0.33 * k, 0.07 * k, 6, 18), style.accent, [0, 0.16 * k, 0], { r: [Math.PI / 2 - 0.25, 0, 0] });
      hat(new THREE.SphereGeometry(0.08 * k, 6, 5), style.accent, [0.24 * k, 0.24 * k, -0.2 * k]);
      body.add(slab(L([[-0.32, 0], [0.32, 0], [0.36, -0.95], [-0.36, -0.95]]), 0.03 * k, 0.01), cloth(m, 0xf3ead8), { p: [0, hip + 0.42 * k, 0.43 * k], r: [-0.1, 0, 0] });
      body.add(tube([[-0.3 * k, hip + 0.1 * k, 0.42 * k], [-0.42 * k, hip + 0.1 * k, 0], [-0.3 * k, hip + 0.05 * k, -0.4 * k]], 0.025 * k, 6, 4), cloth(m, 0xf3ead8), {}, { outline: false });
      break;
    }
    case 'merchant': {
      hat(lathe(L([[0.7, 0.0], [0.68, 0.05], [0.42, 0.06], [0.32, 0.08], [0.3, 0.36], [0.22, 0.42], [0.0, 0.43]]), 18), style.accent, [0, 0.24 * k, 0], { r: [0.05, 0, 0.06] });
      hat(new THREE.TorusGeometry(0.31 * k, 0.04 * k, 4, 16), P.crimson, [0, 0.34 * k, 0], { r: [Math.PI / 2, 0, 0] });
      ha.add(slab(L([[0, 0], [0.12, 0.3], [0.08, 0.62], [-0.02, 0.3]]), 0.02 * k), m.character(P.crimson), { p: [0.3 * k, 0.35 * k, -0.1 * k], r: [0, 0.3, -0.5] }, { outline: false });
      for (const s of [-1, 1]) ha.add(tube([[0, 0, 0], [s * 0.08 * k, -0.02 * k, 0], [s * 0.14 * k, 0.03 * k, -0.02 * k]], 0.025 * k, 6, 4), m.character(hairColor), { p: [0, -0.08 * k, 0.32 * k] }, { outline: false });
      body.add(board(0.55 * k, 0.65 * k, 0.3 * k, 0.05 * k), m.character(LEATHER), { p: [0, shoulder - 0.3 * k, -0.45 * k] });
      body.add(lathe(L([[0.12, -0.32], [0.13, -0.3], [0.13, 0.3], [0.12, 0.32]]), 10), cloth(m, P.moss), { p: [0, shoulder + 0.1 * k, -0.45 * k], r: [0, 0, Math.PI / 2] });
      break;
    }
    case 'farmer': {
      hat(jitter(lathe(L([[0.62, 0.0], [0.58, 0.04], [0.3, 0.08], [0.26, 0.28], [0.12, 0.36], [0.0, 0.37]]), 16), 0.02 * k, seed), 0xd9b45a, [0, 0.26 * k, 0], { r: [0.12, 0, -0.05] });
      hat(new THREE.TorusGeometry(0.27 * k, 0.035 * k, 4, 14), P.crimson, [0, 0.36 * k, 0], { r: [Math.PI / 2 + 0.12, 0, 0] });
      break;
    }
    case 'courier': {
      hat(lathe(L([[0.37, 0], [0.36, 0.1], [0.28, 0.24], [0.0, 0.28]]), 14), style.accent, [0, 0.12 * k, 0]);
      ha.add(slab(L([[-0.2, 0], [0.2, 0], [0.16, 0.2], [-0.16, 0.2]]), 0.03 * k), m.character(style.accent), { p: [0, 0.13 * k, 0.3 * k], r: [-Math.PI / 2 + 0.25, 0, 0] });
      body.add(board(0.46 * k, 0.38 * k, 0.16 * k, 0.04 * k), m.character(LEATHER), { p: [0.44 * k, hip + 0.05 * k, 0.12 * k] });
      body.add(slab(L([[-0.23, 0], [0.23, 0], [0.18, -0.22], [-0.18, -0.22]]), 0.02 * k), m.character(0x5a3a24), { p: [0.44 * k, hip + 0.24 * k, 0.21 * k] }, { outline: false });
      body.add(new THREE.TorusGeometry(0.48 * k, 0.03 * k, 4, 20), m.character(LEATHER), { p: [0, hip + 0.48 * k, 0], r: [0.1, 0, 0.75] }, { outline: false });
      break;
    }
    case 'official': {
      hat(lathe(L([[0.36, 0], [0.35, 0.04], [0.27, 0.06], [0.29, 0.62], [0.3, 0.66], [0.0, 0.67]]), 14), P.ink, [0, 0.22 * k, 0]);
      hat(new THREE.TorusGeometry(0.285 * k, 0.045 * k, 4, 16), style.accent, [0, 0.36 * k, 0], { r: [Math.PI / 2, 0, 0] });
      body.add(new THREE.TorusGeometry(0.3 * k, 0.04 * k, 6, 18), m.metal(0xc9973a), { p: [0, shoulder - 0.02 * k, 0.1 * k], r: [Math.PI / 2.4, 0, 0] }, { outline: false });
      body.add(new THREE.CylinderGeometry(0.08 * k, 0.08 * k, 0.03 * k, 10), m.glow(P.gold, 1.2), { p: [0, shoulder - 0.25 * k, 0.4 * k], r: [Math.PI / 2, 0, 0] }, { outline: false });
      body.add(board(0.12 * k, 1.5 * k, 0.03 * k), cloth(m, style.accent), { p: [0, hip - 0.1 * k, 0.5 * k], r: [-0.07, 0, 0] }, { outline: false });
      break;
    }
    case 'traveler': {
      const hood = jitter(lathe(L([[0.45, -0.2], [0.47, 0.05], [0.42, 0.3], [0.28, 0.55], [0.12, 0.72], [0.0, 0.78]]), 14), 0.02 * k, seed);
      hat(uvScale(hood, 3, 1), style.accent, [0, 0.04 * k, -0.05 * k], { r: [-0.2, 0, 0], map: weaveTexture() });
      break;
    }
    case 'patron':
    case 'villager': {
      if (seed % 3 === 0) hat(lathe(L([[0.37, 0], [0.36, 0.1], [0.24, 0.24], [0.0, 0.27]]), 12), style.accent, [0, 0.14 * k, -0.02 * k]);
      break;
    }
  }
  head.add(ha.build('head'));
  rig.add(body.build('body'));
  rig.add(head);

  if (role === 'traveler') {
    // A walking staff with a glowing stone, held in the right hand.
    const staff = m.kit(0.03);
    staff.add(jitter(lathe(L([[0.05, -1.4], [0.045, 0.6], [0.07, 0.7], [0.04, 0.85]]), 6), 0.01, seed), m.wood(0x6b4428));
    const sObj = staff.build();
    sObj.position.set(0.02 * k, -0.72 * k, 0.1 * k);
    armR.add(sObj);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1 * k), m.glow(P.gold, 2.4));
    gem.position.set(0.02 * k, 0.05 * k, 0.1 * k);
    armR.add(gem);
  }

  root.add(shadowDisc(0.78 * k));
  root.userData.rig = { rig, head, armL, armR, legL, legR, kind: 'person', seed: seed % 50 } satisfies Rig;
  return root;
}

/** Colour styles per NPC tag; keeps characters readable at a distance. */
export function styleFor(m: Materials, tags: string[], isPlayer = false): FigureStyle {
  const P = m.palette;
  if (isPlayer) return { body: 0xe8d8b8, accent: P.ember, role: 'player', height: 2.55, skin: 0xe7c39a };
  if (tags.includes('innkeeper')) return { body: P.crimson, accent: P.gold, role: 'innkeeper', hair: 0x8a4a2a };
  if (tags.includes('merchant')) return { body: P.gold, accent: 0x5a3a24, role: 'merchant', hair: 0x3a2416 };
  if (tags.includes('farmer')) return { body: P.moss, accent: 0xc9a060, role: 'farmer', hair: 0xc9a060 };
  if (tags.includes('courier')) return { body: P.ember, accent: 0x2a3a4a, role: 'courier', hair: 0x2a1a1a };
  if (tags.includes('official')) return { body: 0x2a2030, accent: P.crimson, role: 'official' };
  if (tags.includes('traveler')) return { body: 0x6a6a7a, accent: P.moss, role: 'traveler' };
  return { body: P.stone, accent: P.light, role: 'villager' };
}

export interface PoseInput {
  /** Seconds (presentation clock). */
  t: number;
  /** 0 = standing, 1 = full walk, >1 = run. */
  walk: number;
  sleeping?: boolean;
  seated?: boolean;
  /** Turned towards someone and chatting. */
  talking?: boolean;
  /** Familiar: nose down. */
  sniff?: boolean;
  /** Familiar: delighted (after care). 0…1, fades. */
  joy?: number;
}

/** Pose a figure or Familiar for this frame. Purely visual. */
export function animateFigure(root: THREE.Object3D, p: PoseInput): void {
  const r = rigOf(root);
  if (!r) return;
  const t = p.t + r.seed;
  const rig = r.rig;
  const shadow = root.getObjectByName('blob-shadow');
  if (r.kind === 'person') {
    if (p.sleeping) {
      rig.rotation.set(0, 0, Math.PI / 2);
      rig.position.set(1.15, 0.38, 0);
      rig.scale.y = 1 + Math.sin(t * 1.2) * 0.02;
      if (r.head) r.head.rotation.set(0, 0, 0);
      for (const l of [r.armL, r.armR, r.legL, r.legR]) if (l) l.rotation.x = 0;
      if (shadow) shadow.scale.set(1.8, 1, 1);
      return;
    }
    if (shadow) shadow.scale.set(1, 1, 1);
    rig.rotation.set(0, 0, 0);
    const w = Math.min(p.walk, 1.6);
    const cadence = w > 1 ? 13 : 9;
    const swing = Math.sin(t * cadence) * 0.55 * Math.min(1, w);
    if (p.seated) {
      rig.position.set(0, -0.45, 0);
      if (r.legL) r.legL.rotation.x = -1.3;
      if (r.legR) r.legR.rotation.x = -1.3;
      if (r.armL) r.armL.rotation.x = -0.5 + Math.sin(t * 0.8) * 0.15;
      if (r.armR) r.armR.rotation.x = -0.7 + Math.max(0, Math.sin(t * 0.5)) * 0.6; // a sip now and then
    } else {
      rig.position.set(0, w > 0.05 ? Math.abs(Math.sin(t * cadence)) * 0.09 * Math.min(1, w) : 0, 0);
      if (r.legL) r.legL.rotation.x = swing;
      if (r.legR) r.legR.rotation.x = -swing;
      const gesture = p.talking ? Math.max(0, Math.sin(t * 2.6)) * 0.7 : 0;
      if (r.armL) r.armL.rotation.x = -swing * 0.8 + (w < 0.05 ? Math.sin(t * 1.3) * 0.05 : 0);
      if (r.armR) r.armR.rotation.x = swing * 0.8 - gesture;
    }
    // Breathing and a little head life when idle.
    rig.scale.y = 1 + (w < 0.05 ? Math.sin(t * 2) * 0.012 : 0);
    rig.rotation.x = w > 1 ? 0.12 : w > 0.05 ? 0.05 : 0;
    if (r.head) {
      r.head.rotation.y = w < 0.05 && !p.talking ? Math.sin(t * 0.45) * 0.35 : 0;
      r.head.rotation.x = p.talking ? Math.sin(t * 3.1) * 0.08 : 0;
    }
    return;
  }
  if (r.kind === 'hound' || r.kind === 'animal') {
    const w = Math.min(p.walk, 1.6);
    const joy = p.joy ?? 0;
    rig.position.y = (w > 0.05 ? Math.abs(Math.sin(t * 14)) * 0.08 : 0) + joy * Math.abs(Math.sin(t * 9)) * 0.45;
    rig.rotation.y = joy > 0.3 ? t * 7 * joy : 0;
    const step = Math.sin(t * 14) * 0.6 * Math.min(1, w);
    (r.legs ?? []).forEach((leg, i) => (leg.rotation.x = i < 2 ? step : -step));
    if (r.tail) {
      r.tail.rotation.y = Math.sin(t * (joy > 0 ? 26 : w > 0.05 ? 12 : 5)) * (joy > 0 ? 0.8 : 0.45);
    }
    if (r.head) r.head.rotation.x = p.sniff ? 0.5 + Math.sin(t * 16) * 0.08 : w < 0.05 ? Math.sin(t * 0.7) * 0.08 : 0;
    return;
  }
  if (r.kind === 'moth') {
    for (const [i, wing] of (r.wings ?? []).entries()) wing.rotation.y = (i ? -1 : 1) * (0.3 + Math.abs(Math.sin(t * 18)) * 0.9);
    rig.position.y = 1.6 + Math.sin(t * 2) * 0.25 + (p.joy ?? 0) * 0.6;
    rig.rotation.y = (p.joy ?? 0) > 0.2 ? t * 6 : 0;
    return;
  }
  if (r.kind === 'raven') {
    const joy = p.joy ?? 0;
    rig.position.y = p.walk > 0.05 ? Math.abs(Math.sin(t * 10)) * 0.18 : joy * Math.abs(Math.sin(t * 8)) * 0.4;
    for (const [i, wing] of (r.wings ?? []).entries()) wing.rotation.z = (i ? -1 : 1) * (joy > 0.1 || p.walk > 1 ? 0.4 + Math.sin(t * 20) * 0.6 : 0.1);
    if (r.head) r.head.rotation.y = Math.sin(t * 1.7) * 0.5;
  }
}


// ── Familiars ────────────────────────────────────────────────────────────────

/** Leg pivot with a tapered leg and a paw. */
function pawLeg(m: Materials, color: number, paw: number, at: V3, len: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(...at);
  const a = m.kit(0.025);
  a.add(lathe([[0.06, -len], [0.07, -len * 0.6], [0.1, -len * 0.15], [0.09, 0]], 8), m.character(color));
  a.add(new THREE.SphereGeometry(0.075, 8, 6), m.character(paw), { p: [0, -len, 0.03], s: [1, 0.6, 1.3] });
  pivot.add(a.build());
  return pivot;
}

/** Original Familiar figures: a russet hound, a lantern moth, a keep raven. */
export function createFamiliarFigure(m: Materials, figure: string): THREE.Group {
  const P = m.palette;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  if (figure === 'hound') {
    const russet = P.ember;
    const a = m.kit(0.04);
    // Deep chest, tucked waist: a turned body laid along z.
    a.add(lathe([[0.05, -0.55], [0.2, -0.48], [0.25, -0.25], [0.24, 0.0], [0.31, 0.25], [0.29, 0.42], [0.14, 0.56], [0.0, 0.58]], 14), m.character(russet), { p: [0, 0.68, 0], r: [Math.PI / 2, 0, 0] });
    a.add(new THREE.SphereGeometry(0.22, 10, 8), m.character(P.light), { p: [0, 0.6, 0.4], s: [0.9, 1, 0.8] }, { outline: false });
    a.add(new THREE.TorusGeometry(0.2, 0.05, 6, 16), m.character(P.crimson), { p: [0, 0.86, 0.48], r: [1.2, 0, 0] }, { outline: false });
    a.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), m.metal(0xc9973a), { p: [0, 0.68, 0.64], r: [1.3, 0, 0] }, { outline: false });
    rig.add(a.build('hound-body'));
    const head = new THREE.Group();
    head.position.set(0, 1.0, 0.62);
    const ha = m.kit(0.035);
    ha.add(new THREE.SphereGeometry(0.25, 12, 10), m.character(russet), { s: [1, 0.95, 1.05] });
    ha.add(lathe([[0.15, 0], [0.14, 0.12], [0.11, 0.24], [0.06, 0.3], [0.0, 0.31]], 10), m.character(P.light), { p: [0, -0.07, 0.15], r: [Math.PI / 2, 0, 0] });
    ha.add(new THREE.SphereGeometry(0.06, 8, 6), m.toon(0x1a1014), { p: [0, -0.04, 0.46], s: [1.2, 0.9, 1] }, { outline: false });
    for (const x of [-1, 1]) {
      ha.add(slab([[0, 0], [0.12, -0.05], [0.14, -0.3], [0.04, -0.38], [-0.04, -0.2]], 0.04), m.character(0x8a3a1a), { p: [x * 0.2, 0.12, -0.02], r: [0, x * 0.3, x * -0.35] });
      ha.add(new THREE.SphereGeometry(0.045, 8, 6), m.toon(0x1a1014), { p: [x * 0.11, 0.06, 0.21] }, { outline: false });
      ha.add(new THREE.SphereGeometry(0.014, 5, 4), m.glow(0xffffff, 1), { p: [x * 0.11 + 0.012, 0.075, 0.25] }, { outline: false });
    }
    head.add(ha.build('hound-head'));
    rig.add(head);
    const legs = ([[-0.15, 0.55, 0.32], [0.15, 0.55, -0.34], [0.15, 0.55, 0.32], [-0.15, 0.55, -0.34]] as V3[]).map((at) => pawLeg(m, russet, P.light, at, 0.42));
    for (const l of legs) rig.add(l);
    const tail = new THREE.Group();
    tail.position.set(0, 0.8, -0.5);
    const ta = m.kit(0.025);
    ta.add(tube([[0, 0, 0], [0, 0.15, -0.15], [0, 0.35, -0.2], [0, 0.5, -0.12]], 0.06, 10, 6), m.character(russet));
    ta.add(new THREE.SphereGeometry(0.07, 8, 6), m.character(P.light), { p: [0, 0.5, -0.12] }, { outline: false });
    tail.add(ta.build());
    rig.add(tail);
    root.add(shadowDisc(0.75));
    root.userData.rig = { rig, head, tail, legs, kind: 'hound', seed: 3 } satisfies Rig;
  } else if (figure === 'moth') {
    // A soft glowing body, feathered antennae, and lobed wings that catch the light.
    const body = new THREE.Mesh(lathe([[0, -0.26], [0.07, -0.2], [0.1, -0.05], [0.09, 0.08], [0.11, 0.14], [0.08, 0.22], [0, 0.26]], 10), m.glow(P.light, 1.6));
    body.rotation.x = Math.PI / 2;
    rig.add(body);
    const ant = m.kit(0.01);
    for (const x of [-1, 1]) ant.add(tube([[0, 0, 0.24], [x * 0.08, 0.12, 0.36], [x * 0.18, 0.18, 0.4]], 0.012, 8, 3), m.toon(P.gold), {}, { outline: false });
    rig.add(ant.build());
    const wings: THREE.Object3D[] = [];
    const wingShape: [number, number][] = [[0, 0.04], [0.18, 0.22], [0.42, 0.3], [0.56, 0.18], [0.5, 0.0], [0.38, -0.12], [0.44, -0.3], [0.3, -0.38], [0.12, -0.24], [0, -0.06]];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const wing = new THREE.Mesh(slab(wingShape.map(([x, y]) => [x * side, y] as [number, number]), 0.01), new THREE.MeshBasicMaterial({ color: new THREE.Color(P.gold).multiplyScalar(1.6), transparent: true, opacity: 0.8, side: THREE.DoubleSide, toneMapped: false }));
      wing.rotation.x = -Math.PI / 2;
      pivot.add(wing);
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), new THREE.MeshBasicMaterial({ color: 0x5a2a14, side: THREE.DoubleSide }));
      spot.rotation.x = -Math.PI / 2;
      spot.position.set(side * 0.3, 0.012, -0.1);
      pivot.add(spot);
      rig.add(pivot);
      wings.push(pivot);
    }
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: softDisc(), color: P.gold, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
    halo.name = 'moth-halo';
    rig.add(halo);
    rig.add(new THREE.PointLight(P.gold, 3, 5, 1.8));
    rig.position.y = 1.6;
    root.add(shadowDisc(0.35));
    root.userData.rig = { rig, wings, kind: 'moth', seed: 7 } satisfies Rig;
  } else {
    const ink = 0x1e1a24;
    const a = m.kit(0.035);
    a.add(lathe([[0.0, -0.42], [0.16, -0.3], [0.27, -0.05], [0.26, 0.15], [0.16, 0.3], [0.0, 0.34]], 12), m.character(ink), { p: [0, 0.5, 0], r: [Math.PI / 2 - 0.35, 0, 0] });
    a.add(slab([[-0.2, 0], [0.2, 0], [0.24, -0.38], [0.08, -0.3], [0, -0.42], [-0.08, -0.3], [-0.24, -0.38]], 0.03), m.character(ink), { p: [0, 0.4, -0.35], r: [-Math.PI / 2 + 0.5, 0, 0] });
    for (const x of [-0.08, 0.08]) a.add(tube([[x, 0.28, 0.04], [x, 0.12, 0.06], [x, 0.0, 0.1]], 0.02, 4, 3), m.toon(P.gold), {}, { outline: false });
    rig.add(a.build('raven-body'));
    const head = new THREE.Group();
    head.position.set(0, 0.86, 0.3);
    const ha = m.kit(0.03);
    ha.add(new THREE.SphereGeometry(0.19, 10, 8), m.character(ink));
    ha.add(lathe([[0.07, 0], [0.05, 0.14], [0.01, 0.3], [0, 0.31]], 8), m.character(0x3a3440), { p: [0, -0.03, 0.12], r: [Math.PI / 2 + 0.15, 0, 0] });
    for (const x of [-0.09, 0.09]) ha.add(new THREE.SphereGeometry(0.035, 6, 5), m.glow(P.gold, 1.8), { p: [x, 0.05, 0.15] }, { outline: false });
    head.add(ha.build());
    rig.add(head);
    const wings: THREE.Object3D[] = [];
    const feather: [number, number][] = [[0, 0.08], [0.1, 0.1], [0.14, -0.1], [0.12, -0.42], [0.06, -0.5], [0.04, -0.36], [0, -0.44], [-0.02, -0.2]];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.24, 0.62, 0.05);
      const wa = m.kit(0.025);
      wa.add(slab(feather, 0.05), m.character(0x2e2a36), { p: [side * 0.02, 0, 0], r: [-Math.PI / 2 + 0.3, side * 0.15, 0] });
      pivot.add(wa.build());
      rig.add(pivot);
      wings.push(pivot);
    }
    root.add(shadowDisc(0.45));
    root.userData.rig = { rig, head, wings, kind: 'raven', seed: 11 } satisfies Rig;
  }
  return root;
}

/** Small farm and town animals for ambient life (rigged like Familiars so they animate the same way). */
export function createAnimal(m: Materials, kind: 'chicken' | 'sheep' | 'crow' | 'cat', color?: number): THREE.Group {
  const P = m.palette;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const head = new THREE.Group();
  let tail: THREE.Object3D | undefined;
  let legs: THREE.Object3D[] | undefined;
  const a = m.kit(0.03);
  const ha = m.kit(0.025);
  switch (kind) {
    case 'chicken': {
      const c = color ?? 0xf3ead8;
      a.add(lathe([[0, -0.3], [0.2, -0.2], [0.26, 0.0], [0.22, 0.18], [0.12, 0.26], [0, 0.28]], 10), m.character(c), { p: [0, 0.4, 0], r: [Math.PI / 2 - 0.25, 0, 0] });
      a.add(slab([[-0.12, 0], [0.12, 0], [0.16, 0.3], [0.04, 0.22], [0, 0.34], [-0.04, 0.22], [-0.16, 0.3]], 0.04), m.character(c), { p: [0, 0.42, -0.26], r: [-0.6, 0, 0] });
      for (const x of [-0.06, 0.06]) a.add(tube([[x, 0.2, 0], [x, 0.08, 0.02], [x, 0.0, 0.06]], 0.02, 4, 3), m.toon(P.gold), {}, { outline: false });
      head.position.set(0, 0.68, 0.2);
      ha.add(new THREE.SphereGeometry(0.12, 8, 6), m.character(c));
      ha.add(slab([[-0.06, 0], [0.06, 0], [0.05, 0.08], [0.02, 0.05], [0, 0.1], [-0.02, 0.05], [-0.05, 0.08]], 0.03), m.character(P.crimson), { p: [0, 0.1, 0], r: [0, Math.PI / 2, 0] }, { outline: false });
      ha.add(lathe([[0.035, 0], [0, 0.12]], 5), m.toon(P.gold), { p: [0, -0.01, 0.1], r: [Math.PI / 2, 0, 0] }, { outline: false });
      ha.add(new THREE.SphereGeometry(0.035, 6, 5), m.character(P.crimson), { p: [0, -0.08, 0.08] }, { outline: false });
      root.add(shadowDisc(0.35));
      break;
    }
    case 'sheep': {
      const wool = color ?? 0xf3ead8;
      a.add(cluster([[0, 0, 0, 0.45], [0.3, 0.05, 0.2, 0.32], [-0.3, 0.05, 0.2, 0.32], [0.25, 0.05, -0.3, 0.32], [-0.25, 0.05, -0.3, 0.32], [0, 0.25, 0, 0.32]], 5), m.character(wool), { p: [0, 0.78, 0] });
      head.position.set(0, 0.92, 0.6);
      ha.add(lathe([[0.0, -0.22], [0.14, -0.14], [0.16, 0.04], [0.1, 0.18], [0, 0.2]], 10), m.character(0x2a2028), { r: [Math.PI / 2 + 0.3, 0, 0] });
      for (const x of [-1, 1]) {
        ha.add(slab([[0, 0], [0.16, 0.04], [0.18, -0.04]], 0.03), m.character(0x2a2028), { p: [x * 0.12, 0.05, -0.05], r: [0, x > 0 ? 0 : Math.PI, -0.3] }, { outline: false });
        ha.add(new THREE.SphereGeometry(0.03, 5, 4), m.glow(0xffffff, 1), { p: [x * 0.09, 0.06, 0.12] }, { outline: false });
      }
      ha.add(cluster([[0, 0, 0, 0.12]], 3), m.character(wool), { p: [0, 0.16, -0.06] }, { outline: false });
      legs = ([[-0.22, 0.5, 0.3], [0.22, 0.5, -0.3], [0.22, 0.5, 0.3], [-0.22, 0.5, -0.3]] as V3[]).map((at) => pawLeg(m, 0x2a2028, 0x2a2028, at, 0.45));
      for (const l of legs) rig.add(l);
      root.add(shadowDisc(0.8));
      break;
    }
    case 'crow': {
      const c = color ?? 0x1e1a24;
      a.add(lathe([[0.0, -0.3], [0.12, -0.2], [0.18, 0.0], [0.15, 0.14], [0.0, 0.2]], 10), m.character(c), { p: [0, 0.28, 0], r: [Math.PI / 2 - 0.3, 0, 0] });
      a.add(slab([[-0.1, 0], [0.1, 0], [0.12, -0.24], [0, -0.3], [-0.12, -0.24]], 0.02), m.character(c), { p: [0, 0.25, -0.25], r: [-Math.PI / 2 + 0.4, 0, 0] }, { outline: false });
      head.position.set(0, 0.46, 0.17);
      ha.add(new THREE.SphereGeometry(0.11, 8, 6), m.character(c));
      ha.add(lathe([[0.04, 0], [0.0, 0.17]], 6), m.character(0x3a3440), { p: [0, -0.02, 0.08], r: [Math.PI / 2, 0, 0] }, { outline: false });
      root.add(shadowDisc(0.25));
      break;
    }
    case 'cat': {
      const c = color ?? P.ember;
      a.add(lathe([[0.0, -0.32], [0.14, -0.26], [0.17, -0.05], [0.16, 0.15], [0.12, 0.28], [0, 0.3]], 10), m.character(c), { p: [0, 0.34, 0], r: [Math.PI / 2, 0, 0] });
      head.position.set(0, 0.55, 0.36);
      ha.add(new THREE.SphereGeometry(0.16, 10, 8), m.character(c), { s: [1.1, 0.95, 1] });
      for (const x of [-1, 1]) {
        ha.add(slab([[-0.06, 0], [0.06, 0], [0, 0.14]], 0.03), m.character(c), { p: [x * 0.09, 0.12, 0], r: [0, 0, -x * 0.25] });
        ha.add(new THREE.SphereGeometry(0.03, 6, 5), m.glow(0x9adf6a, 1.3), { p: [x * 0.06, 0.03, 0.14], s: [0.8, 1.2, 0.6] }, { outline: false });
      }
      ha.add(new THREE.SphereGeometry(0.025, 5, 4), m.toon(0xe0907a), { p: [0, -0.02, 0.16] }, { outline: false });
      const tt = new THREE.Group();
      tt.position.set(0, 0.38, -0.32);
      const tk = m.kit(0.02);
      tk.add(tube([[0, 0, 0], [0, 0.2, -0.15], [0.05, 0.45, -0.1], [0.12, 0.55, 0.0]], 0.04, 10, 5), m.character(c));
      tt.add(tk.build());
      rig.add(tt);
      tail = tt;
      legs = ([[-0.09, 0.22, 0.2], [0.09, 0.22, -0.2], [0.09, 0.22, 0.2], [-0.09, 0.22, -0.2]] as V3[]).map((at) => pawLeg(m, c, c, at, 0.18));
      for (const l of legs) rig.add(l);
      root.add(shadowDisc(0.4));
      break;
    }
  }
  rig.add(a.build(kind));
  head.add(ha.build());
  rig.add(head);
  root.userData.rig = { rig, head, tail, legs, kind: 'animal', seed: Math.floor((color ?? 5) % 17) + kind.length } satisfies Rig;
  return root;
}
