import * as THREE from 'three';
import type { Label } from '../builder';
import type { PropSpec, SceneLayout } from '../layout';
import type { Materials } from '../materials';
import {
  bannerTexture, endGrainTexture, latticeTexture, paperTexture, rugTexture, runeTexture, signTexture,
  softDisc, staveTexture, stripeTextureV,
} from '../textures';
import { board, cluster, facet, hash, jitter, lathe, ribbed, slab, slabShape, tube, type Assembly, type V3 } from './geo';

/**
 * ART KIT — props.
 *
 * Every visible prop in Blackmere is built here from shaped parts in one
 * material language: grained wood, dressed stone, lime plaster, shingles,
 * straw, burlap, striped cloth, wrought iron, painted signs and glowing glass.
 * Parts that share a material are merged (see `Assembly`), so a detailed
 * stall or house costs a handful of draw calls. Collision is unchanged: it
 * still comes from the layout footprints, never from this geometry.
 *
 * Objects that animate keep their own meshes and names: `window-glow`,
 * `lamp-glow`, `lamp-halo`, `flame`, `banner-cloth`, `bunting`.
 */

// Shared tones (presentation only).
const TONE = {
  oak: 0x6b4428,
  darkOak: 0x3b2516,
  pale: 0x9a7650,
  weathered: 0x7d7062,
  plaster: 0xead7b4,
  burlap: 0xb4946a,
  soil: 0x3a2618,
  glass: 0x8fae9a,
  leaf: 0x4f6b2a,
  iron: 0x34303a,
  brass: 0xc9973a,
};

const WOOD_TILE = 1.4;
const STONE_TILE = 1.8;

function rot(seed: number, k = 0.06): V3 {
  return [(hash(seed) - 0.5) * k, (hash(seed + 1) - 0.5) * k * 4, (hash(seed + 2) - 0.5) * k];
}

// ── Reusable pieces ──────────────────────────────────────────────────────────

/** Turned post (lathe) with a base, a shaft and a cap. */
function turnedPost(h: number, r: number): THREE.BufferGeometry {
  return lathe([[r * 1.5, 0], [r * 1.5, 0.08], [r * 1.05, 0.14], [r, h * 0.45], [r * 1.25, h * 0.5], [r, h * 0.55], [r * 0.95, h - 0.1], [r * 1.3, h - 0.06], [r * 0.6, h]], 8);
}

/** A tankard, jar, pot or bottle by profile. */
const vessels = {
  tankard: () => lathe([[0.0, 0], [0.09, 0], [0.1, 0.02], [0.09, 0.2], [0.1, 0.22], [0.0, 0.22]], 10),
  jar: () => lathe([[0, 0], [0.1, 0], [0.13, 0.08], [0.12, 0.2], [0.07, 0.25], [0.08, 0.28], [0, 0.28]], 10),
  bottle: () => lathe([[0, 0], [0.08, 0], [0.09, 0.18], [0.04, 0.26], [0.03, 0.36], [0.04, 0.38], [0, 0.38]], 10),
  bowl: () => lathe([[0, 0], [0.12, 0], [0.2, 0.06], [0.22, 0.1], [0.0, 0.1]], 12),
  basket: () => lathe([[0, 0], [0.24, 0], [0.32, 0.22], [0.34, 0.26], [0.0, 0.26]], 12),
  cheese: () => lathe([[0, 0], [0.2, 0], [0.22, 0.04], [0.22, 0.1], [0.2, 0.14], [0, 0.14]], 14),
  loaf: () => jitter(new THREE.SphereGeometry(0.16, 10, 6).scale(1.5, 0.7, 1), 0.02, 4),
  apple: () => new THREE.SphereGeometry(0.09, 8, 6),
};

/** Goods heaped in a basket: the visual vocabulary of the market. */
function goodsBasket(a: Assembly, m: Materials, at: V3, fruit: number, seed: number): void {
  a.add(vessels.basket(), m.weave(0xc0904a), { p: at }, { outline: true });
  for (let i = 0; i < 6; i++) {
    const ang = i * 1.05 + seed;
    a.add(vessels.apple(), m.toon(fruit), { p: [at[0] + Math.cos(ang) * 0.15, at[1] + 0.27 + (i % 2) * 0.06, at[2] + Math.sin(ang) * 0.15] }, { outline: false });
  }
}

/** A plank panel made of boards with small gaps, facing +z. */
function planks(a: Assembly, mat: THREE.Material, w: number, h: number, at: V3, opts: { vertical?: boolean; thick?: number; seed?: number } = {}): void {
  const t = opts.thick ?? 0.07;
  const n = Math.max(2, Math.round((opts.vertical ? w : h) / 0.26));
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    const s = (opts.seed ?? 1) + i;
    if (opts.vertical) a.add(board(w / n - 0.02, h - hash(s) * 0.05, t), mat, { p: [at[0] - w / 2 + k * w, at[1], at[2]], r: rot(s, 0.02) }, { uvTile: WOOD_TILE });
    else a.add(board(w - hash(s) * 0.06, h / n - 0.02, t), mat, { p: [at[0], at[1] - h / 2 + k * h, at[2]], r: rot(s, 0.015) }, { uvTile: WOOD_TILE });
  }
}

/** A glowing lantern (cage, cap, glass), returned as a group; the glass is a separate `lamp-glow` mesh. */
export function lanternHead(m: Materials, scale = 1): THREE.Group {
  const P = m.palette;
  const g = new THREE.Group();
  const a = m.kit(0.02);
  const iron = m.metal(TONE.iron);
  a.add(lathe([[0.02, 0.38], [0.24, 0.3], [0.28, 0.26], [0.2, 0.24]], 6), iron);
  a.add(lathe([[0.02, 0.5], [0.05, 0.46], [0.04, 0.38]], 6), iron);
  a.add(new THREE.TorusGeometry(0.06, 0.018, 4, 10), iron, { p: [0, 0.53, 0] });
  a.add(lathe([[0.2, -0.24], [0.24, -0.2], [0.16, -0.16], [0.05, -0.3], [0.0, -0.32]], 6), iron);
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2;
    a.add(board(0.03, 0.46, 0.03), iron, { p: [Math.cos(ang) * 0.19, 0.03, Math.sin(ang) * 0.19] }, { outline: false });
  }
  const frame = a.build();
  g.add(frame);
  const glass = new THREE.Mesh(lathe([[0.15, -0.18], [0.18, 0.0], [0.15, 0.22]], 6), m.glow(P.gold, 3));
  glass.name = 'lamp-glow';
  g.add(glass);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDisc(), color: P.gold, transparent: true, opacity: 0, depthWrite: false }));
  halo.scale.setScalar(2.8);
  halo.name = 'lamp-halo';
  g.add(halo);
  g.scale.setScalar(scale);
  return g;
}

/** A painted signboard on its own mesh (front face painted, edges wood). */
function signBoard(m: Materials, text: string, w: number, h: number, emblem?: Parameters<typeof signTexture>[3]): THREE.Group {
  const g = new THREE.Group();
  const a = m.kit(0.025);
  a.add(board(w + 0.12, h + 0.12, 0.08), m.wood(TONE.darkOak), {}, { uvTile: WOOD_TILE });
  g.add(a.build());
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m.painted(signTexture(text, 0xe8d4a8, 0x3a2416, emblem)));
  face.position.z = 0.045;
  const back = face.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.045;
  g.add(face, back);
  return g;
}

/** A crown of faceted autumn foliage. */
export function crownGeometry(seed: number, r = 1.6): THREE.BufferGeometry {
  const blobs: [number, number, number, number][] = [
    [0, 0, 0, r],
    [r * 0.75, -r * 0.15, r * 0.2, r * 0.7],
    [-r * 0.7, -r * 0.1, -r * 0.25, r * 0.72],
    [r * 0.15, r * 0.7, -r * 0.2, r * 0.72],
    [-r * 0.2, -r * 0.35, r * 0.7, r * 0.6],
  ];
  return cluster(blobs, seed);
}

/** A flared trunk with two short boughs. */
export function trunkGeometry(seed: number, h = 2.4): THREE.BufferGeometry {
  const t = jitter(lathe([[0.42, 0], [0.3, 0.2], [0.22, 0.6], [0.2, h * 0.8], [0.14, h]], 7), 0.05, seed);
  const parts = [facet(t)];
  parts.push(tube([[0, h * 0.6, 0], [0.45, h * 0.85, 0.1], [0.75, h * 1.05, 0.2]], 0.07, 6, 4));
  parts.push(tube([[0, h * 0.7, 0], [-0.4, h * 0.95, -0.1], [-0.6, h * 1.15, -0.25]], 0.06, 6, 4));
  const merged = new THREE.BufferGeometry();
  const geos = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const count = geos.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of geos) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return merged;
}

/** A fallen leaf lying flat: a pointed oval with a slight curl. */
export function leafGeometry(): THREE.BufferGeometry {
  const g = slab([[0, -0.18], [0.08, -0.08], [0.09, 0.04], [0, 0.18], [-0.09, 0.04], [-0.08, -0.08]], 0.01);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + Math.abs(pos.getX(i)) * 0.25);
  g.computeVertexNormals();
  return g;
}

/** Three crossed blades: a grass tuft that reads as grass, not a cone. */
export function grassTuftGeometry(): THREE.BufferGeometry {
  const blade = (ang: number, h: number, lean: number) => {
    const g = new THREE.BufferGeometry();
    const w = 0.07;
    const v = [-w, 0, 0, w, 0, 0, lean, h, 0];
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
    g.rotateY(ang);
    return g;
  };
  const parts = [blade(0, 0.55, 0.1), blade(1.1, 0.45, -0.12), blade(2.2, 0.5, 0.05), blade(0.5, 0.35, 0.15), blade(2.7, 0.4, -0.08)];
  const count = parts.length * 3;
  const pos = new Float32Array(count * 3);
  parts.forEach((g, i) => pos.set(g.getAttribute('position').array as Float32Array, i * 9));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

// ── Buildings ────────────────────────────────────────────────────────────────

function windowUnit(m: Materials, g: THREE.Group, a: Assembly, x: number, y: number, z: number, seed: number, flowerBox: boolean): void {
  const P = m.palette;
  const dark = m.wood(TONE.darkOak);
  a.add(board(1.15, 0.12, 0.16), dark, { p: [x, y + 0.5, z + 0.04] }, { uvTile: WOOD_TILE });
  a.add(board(1.25, 0.12, 0.26), dark, { p: [x, y - 0.5, z + 0.08] }, { uvTile: WOOD_TILE });
  for (const sx of [-0.52, 0.52]) a.add(board(0.12, 1.0, 0.16), dark, { p: [x + sx, y, z + 0.04] }, { uvTile: WOOD_TILE });
  // Shutters swung open on their hinges, each at its own angle.
  for (const side of [-1, 1]) {
    const open = 1.0 + hash(seed + side) * 0.35;
    const hx = x + side * 0.56;
    a.add(board(0.48, 0.9, 0.05), m.wood(0x4f6a3a), { p: [hx + side * Math.cos(open) * 0.24, y, z + 0.08 + Math.sin(open) * 0.24], r: [0, -side * open, 0] }, { uvTile: WOOD_TILE });
  }
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.88), m.glow(P.gold, 2.6, 1, latticeTexture()));
  pane.position.set(x, y, z + 0.03);
  pane.name = 'window-glow';
  g.add(pane);
  if (flowerBox) {
    a.add(board(1.1, 0.24, 0.3), m.wood(TONE.oak), { p: [x, y - 0.68, z + 0.2] }, { uvTile: WOOD_TILE });
    for (let i = 0; i < 6; i++) {
      a.add(new THREE.IcosahedronGeometry(0.09, 0), m.toon(i % 2 ? P.crimson : P.gold), { p: [x - 0.42 + i * 0.17, y - 0.5 + hash(seed + i) * 0.06, z + 0.22] }, { outline: false });
    }
    a.add(cluster([[0, 0, 0, 0.2], [0.3, 0, 0, 0.16], [-0.3, 0, 0, 0.17]], seed), m.toon(TONE.leaf), { p: [x, y - 0.56, z + 0.2] }, { outline: false });
  }
}

/** A half-timbered (or stone) house with shingle roof, chimney, door, windows and an optional hanging sign. */
export function house(m: Materials, w: number, d: number, h: number, wallKey: string | undefined, roofColor: number, label: string | undefined, seed: number): THREE.Group {
  const P = m.palette;
  const g = new THREE.Group();
  const a = m.kit(0.045);
  const stoneWalls = wallKey === 'stone';
  const wallMat = stoneWalls ? m.stone(0x8a8276) : m.plaster(TONE.plaster);
  const beam = m.wood(TONE.darkOak);
  const front = d / 2;
  // Plinth and walls.
  a.add(board(w + 0.35, 0.6, d + 0.35, 0.08), m.stone(0x6e6870), { p: [0, 0.3, 0] }, { uvTile: STONE_TILE });
  a.add(new THREE.BoxGeometry(w, h - 0.55, d), wallMat, { p: [0, 0.55 + (h - 0.55) / 2, 0] }, { uvTile: stoneWalls ? STONE_TILE : 2.4 });
  if (!stoneWalls) {
    // Timber framing on every face that shows: posts, rails, braces.
    for (const [fx, fz, len, ry] of [[0, front, w, 0], [0, -front, w, Math.PI], [w / 2, 0, d, Math.PI / 2], [-w / 2, 0, d, -Math.PI / 2]] as const) {
      const n = Math.max(2, Math.round(len / 2.2));
      const out = 0.05;
      const ox = fx + Math.sin(ry) * out;
      const oz = fz + Math.cos(ry) * out;
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + (i / n) * len;
        a.add(board(0.2, h - 0.55, 0.12), beam, { p: [ox + Math.cos(ry) * t, 0.55 + (h - 0.55) / 2, oz - Math.sin(ry) * t], r: [0, ry, 0] }, { uvTile: WOOD_TILE });
      }
      for (const y of [0.62, h * 0.55, h - 0.1]) a.add(board(len + 0.1, 0.18, 0.12), beam, { p: [ox, y, oz], r: [0, ry, 0] }, { uvTile: WOOD_TILE });
      // A brace in the first bay.
      const bay = len / n;
      const bh = h * 0.55 - 0.62;
      const t0 = -len / 2 + bay / 2;
      a.add(board(Math.hypot(bay, bh) - 0.1, 0.14, 0.1), beam, { p: [ox + Math.cos(ry) * t0, 0.62 + bh / 2, oz - Math.sin(ry) * t0], r: [0, ry, Math.atan2(bh, bay)] }, { uvTile: WOOD_TILE });
    }
  } else {
    // Quoins: big corner stones.
    for (const [cx, cz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
      for (let y = 0.9; y < h; y += 0.9) a.add(board(0.5, 0.42, 0.5, 0.05), m.stone(0x9a9284), { p: [(cx * w) / 2, y, (cz * d) / 2], r: rot(seed + y, 0.04) }, { uvTile: STONE_TILE });
    }
  }
  // Door: planks, iron straps, frame, step, a lamp beside it.
  const dw = Math.min(1.25, w * 0.22);
  const dh = Math.min(2.15, h * 0.52);
  const doorX = w >= 8 ? w * 0.3 : 0;
  planks(a, m.wood(TONE.oak), dw, dh, [doorX, 0.55 + dh / 2, front + 0.06], { vertical: true, thick: 0.08, seed });
  for (const y of [0.55 + dh * 0.25, 0.55 + dh * 0.75]) a.add(board(dw * 0.8, 0.07, 0.04), m.metal(TONE.iron), { p: [doorX - dw * 0.05, y, front + 0.12] }, { outline: false });
  a.add(new THREE.TorusGeometry(0.07, 0.02, 4, 10), m.metal(TONE.brass), { p: [doorX + dw * 0.3, 0.55 + dh * 0.5, front + 0.13] }, { outline: false });
  a.add(board(dw + 0.32, 0.2, 0.2), beam, { p: [doorX, 0.55 + dh + 0.1, front + 0.08] }, { uvTile: WOOD_TILE });
  for (const sx of [-1, 1]) a.add(board(0.16, dh + 0.1, 0.18), beam, { p: [doorX + sx * (dw / 2 + 0.08), 0.55 + dh / 2, front + 0.08] }, { uvTile: WOOD_TILE });
  a.add(board(dw + 0.7, 0.22, 0.6, 0.05), m.stone(0x7a7470), { p: [doorX, 0.11, front + 0.45] }, { uvTile: STONE_TILE });
  // Windows.
  const winY = Math.max(1.75, h * 0.42);
  const xs = w >= 8 ? [-w * 0.3, -w * 0.02] : w >= 5 ? [-w * 0.28, w * 0.28] : [w * 0.27];
  xs.forEach((x, i) => {
    if (Math.abs(x - doorX) < dw + 0.4) return;
    windowUnit(m, g, a, x, winY, front, seed + i * 7, (seed + i) % 2 === 0);
  });
  if (h > 4.2) for (const [i, x] of [-w * 0.25, w * 0.25].entries()) windowUnit(m, g, a, x, h * 0.78, front, seed + 20 + i, false);
  // Gable roof: shingled slopes with overhang, barge boards and a ridge cap.
  const rh = Math.max(1.7, h * 0.52);
  const half = d / 2 + 0.55;
  const len = w + 0.8;
  const slope = Math.hypot(half, rh);
  const ang = Math.atan2(rh, half);
  for (const s of [-1, 1]) {
    a.add(board(len, 0.16, slope + 0.1, 0.03), m.shingle(roofColor), { p: [0, h + rh / 2 - 0.02, (s * half) / 2], r: [s * ang, 0, 0] }, { uvTile: 1.1 });
  }
  // Gable ends (wall triangles) and barge boards.
  for (const s of [-1, 1]) {
    a.add(slab([[-d / 2, 0], [d / 2, 0], [0, rh - 0.1]], 0.1), stoneWalls ? m.stone(0x8a8276) : m.plaster(TONE.plaster), { p: [s * (w / 2 - 0.02), h - 0.02, 0], r: [0, Math.PI / 2, 0] }, { uvTile: 2.4 });
    for (const t of [-1, 1]) a.add(board(slope + 0.2, 0.2, 0.1), beam, { p: [s * (len / 2), h + rh / 2, (t * half) / 2], r: [t * ang, Math.PI / 2, 0] }, { uvTile: WOOD_TILE, outline: false });
  }
  a.add(board(len + 0.1, 0.22, 0.3, 0.06), beam, { p: [0, h + rh + 0.02, 0] }, { uvTile: WOOD_TILE });
  // Chimney with cap and pot.
  const cx = -w * 0.32;
  const ch = rh + 1.0;
  a.add(board(0.8, ch, 0.8, 0.05), m.stone(0x7c7470), { p: [cx, h + ch / 2 - 0.1, -d * 0.15] }, { uvTile: STONE_TILE });
  a.add(board(1.0, 0.16, 1.0, 0.04), m.stone(0x5e5860), { p: [cx, h + ch - 0.05, -d * 0.15] }, { uvTile: STONE_TILE });
  a.add(lathe([[0.16, 0], [0.14, 0.25], [0.18, 0.3], [0.12, 0.3]], 8), m.toon(0x9a4a2e), { p: [cx, h + ch + 0.02, -d * 0.15] });
  g.add(a.build('house'));
  if (label) {
    // Hanging painted sign on an iron bracket.
    const sign = signBoard(m, label, 1.6, 0.62, /ladle/i.test(label) ? 'ladle' : /cottage/i.test(label) ? 'key' : 'leaf');
    sign.position.set(doorX + dw / 2 + 1.0, 0.55 + dh + 0.2, front + 0.75);
    sign.rotation.y = Math.PI / 2;
    const b = m.kit(0.02);
    b.add(tube([[doorX + dw / 2 + 0.25, 0.55 + dh + 0.75, front + 0.05], [doorX + dw / 2 + 0.5, 0.55 + dh + 0.8, front + 0.5], [doorX + dw / 2 + 1.0, 0.55 + dh + 0.6, front + 0.75]], 0.035, 8, 4), m.metal(TONE.iron));
    g.add(b.build(), sign);
  }
  return g;
}

// ── Prop dispatcher ─────────────────────────────────────────────────────────

/** Build one prop, centred on the origin (the caller places it). */
export function buildProp(m: Materials, p: PropSpec, labels: Label[], layout: SceneLayout): THREE.Object3D {
  const P = m.palette;
  const [w, d, h] = p.size ?? [1, 1, 1];
  const c = (fallback: keyof typeof P) => m.color(p.color, fallback);
  const seed = Math.round(p.at[0] * 31 + p.at[1] * 17);
  const interior = layout.interior;
  const g = new THREE.Group();
  const a = m.kit();
  const wood = m.wood(TONE.oak);
  const dark = m.wood(TONE.darkOak);
  const iron = m.metal(TONE.iron);
  const done = (name?: string) => {
    g.add(a.build(name));
    return g;
  };

  switch (p.type) {
    case 'building': {
      const house0 = house(m, w, d, h, p.color, m.color(p.roof, 'roof'), p.label, seed);
      if (p.label) labels.push({ text: p.label, position: new THREE.Vector3(p.at[0], h * 1.7 + 1.2, p.at[1]), kind: 'place' });
      return house0;
    }

    case 'gatehouse': {
      for (const side of [-1, 1]) {
        a.add(board(w * 0.32, h * 1.15, d + 0.6, 0.1), m.stone(), { p: [side * w * 0.34, (h * 1.15) / 2, 0] }, { uvTile: STONE_TILE });
        for (let k = 0; k < 3; k++) a.add(board(0.6, 0.7, 0.6, 0.06), m.stone(), { p: [side * w * 0.34 + (k - 1) * 0.95, h * 1.15 + 0.35, d / 2 + 0.1] }, { uvTile: STONE_TILE });
        a.add(board(0.12, 1.1, 0.4), m.toon(P.ink), { p: [side * w * 0.34, h * 0.75, d / 2 + 0.31] }, { outline: false });
      }
      // Arched passage with closed oak gates studded with iron.
      const span = w * 0.4;
      const arch = new THREE.Shape([new THREE.Vector2(-span / 2 - 0.2, 0), new THREE.Vector2(span / 2 + 0.2, 0), new THREE.Vector2(span / 2 + 0.2, h), new THREE.Vector2(-span / 2 - 0.2, h)]);
      const hole = new THREE.Path();
      hole.moveTo(-span / 2 + 0.25, 0);
      hole.lineTo(span / 2 - 0.25, 0);
      hole.lineTo(span / 2 - 0.25, h * 0.55);
      hole.absarc(0, h * 0.55, span / 2 - 0.25, 0, Math.PI, false);
      hole.lineTo(-span / 2 + 0.25, 0);
      arch.holes.push(hole);
      a.add(slabShape(arch, d), m.stone(0x6e6870), {}, { uvTile: STONE_TILE });
      planks(a, wood, span - 0.5, h * 0.55, [0, h * 0.275, 0.1], { vertical: true, thick: 0.12, seed });
      for (let i = 0; i < 12; i++) a.add(new THREE.SphereGeometry(0.05, 5, 4), iron, { p: [-span / 2 + 0.5 + (i % 4) * ((span - 1) / 3), 0.5 + Math.floor(i / 4) * 0.8, 0.2] }, { outline: false });
      return done('gatehouse');
    }

    case 'keep': {
      a.add(board(w, h, d, 0.12), m.stone(), { p: [0, h / 2, 0] }, { uvTile: STONE_TILE });
      for (let x = -w / 2 + 0.6; x <= w / 2 - 0.5; x += 1.4) {
        a.add(board(0.7, 0.8, 0.7, 0.06), m.stone(), { p: [x, h + 0.4, d / 2 - 0.35] }, { uvTile: STONE_TILE });
        a.add(board(0.7, 0.8, 0.7, 0.06), m.stone(), { p: [x, h + 0.4, -d / 2 + 0.35] }, { uvTile: STONE_TILE });
      }
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const th = h * 1.3;
        const tower = lathe([[2.25, 0], [2.05, 0.6], [2, th - 0.3], [2.3, th], [2.3, th + 0.4], [0.0, th + 0.4]], 14);
        const uv = tower.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 7, uv.getY(i) * (th / STONE_TILE));
        a.add(tower, m.stone(), { p: [(x * w) / 2, 0, (z * d) / 2] });
        const roof = lathe([[2.6, 0], [2.0, 0.6], [1.0, 2.4], [0.0, 4.4]], 14);
        const ruv = roof.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * 9, ruv.getY(i) * 4);
        a.add(roof, m.shingle(0x3b2a40), { p: [(x * w) / 2, th + 0.35, (z * d) / 2] });
        for (const yy of [th * 0.45, th * 0.7]) a.add(board(0.16, 0.9, 0.2), m.toon(P.ink), { p: [(x * w) / 2, yy, (z * d) / 2 + 2.02] }, { outline: false });
      }
      // Pennants on the front towers.
      for (const x of [-1, 1]) {
        const th = h * 1.3 + 4.7;
        a.add(lathe([[0.05, 0], [0.04, 2], [0.08, 2.05], [0, 2.15]], 6), iron, { p: [(x * w) / 2, th - 0.3, d / 2] });
        a.add(slab([[0, 0], [1.4, -0.25], [0, -0.55]], 0.03), m.toon(P.crimson), { p: [(x * w) / 2 + 0.05, th + 1.7, d / 2] }, { outline: false });
      }
      labels.push({ text: 'Blackmere Keep', position: new THREE.Vector3(p.at[0], h * 1.3 + 6, p.at[1]), kind: 'place' });
      return done('keep');
    }

    case 'wall': {
      const near = interior && p.at[1] >= layout.size[1] / 2 - 1.5;
      const wh = near ? Math.min(h, 0.9) : h;
      const horizontal = w >= d;
      const len = horizontal ? w : d;
      const r: V3 = [0, horizontal ? 0 : Math.PI / 2, 0];
      const thick = horizontal ? d : w;
      if (interior) {
        // Plaster above a plank wainscot, timber posts, a heavy top beam.
        if (!near) a.add(new THREE.BoxGeometry(len, wh, thick), m.plaster(0xd9c09a), { p: [0, wh / 2, 0], r }, { uvTile: 2.4 });
        const wain = Math.min(wh, 1.15);
        a.add(new THREE.BoxGeometry(len + 0.02, wain, thick + 0.06), m.wood(TONE.oak), { p: [0, wain / 2, 0], r }, { uvTile: WOOD_TILE });
        a.add(board(len + 0.1, 0.14, thick + 0.16), dark, { p: [0, wain, 0], r }, { uvTile: WOOD_TILE });
        if (!near) {
          a.add(board(len + 0.1, 0.3, thick + 0.12), dark, { p: [0, wh - 0.15, 0], r }, { uvTile: WOOD_TILE });
          for (let t = -len / 2 + 0.2; t <= len / 2; t += 2.4) {
            const off: V3 = horizontal ? [t, wh / 2, 0] : [0, wh / 2, t];
            a.add(board(0.24, wh, thick + 0.1), dark, { p: off, r }, { uvTile: WOOD_TILE });
          }
        }
      } else {
        a.add(new THREE.BoxGeometry(len, wh, thick), m.stone(), { p: [0, wh / 2, 0], r }, { uvTile: STONE_TILE });
        a.add(board(len + 0.2, 0.25, thick + 0.25, 0.05), m.stone(0x6e6870), { p: [0, wh + 0.12, 0], r }, { uvTile: STONE_TILE });
        for (let t = -len / 2 + 0.4; t <= len / 2 - 0.3; t += 1.1) {
          const off: V3 = horizontal ? [t, wh + 0.55, 0] : [0, wh + 0.55, t];
          a.add(board(0.6, 0.6, thick + 0.1, 0.05), m.stone(), { p: off, r }, { uvTile: STONE_TILE });
        }
      }
      return done('wall');
    }

    case 'counter': {
      // The bar: panelled front, polished top, brass foot rail, tankards and bottles.
      planks(a, wood, w, h - 0.1, [0, (h - 0.1) / 2, d / 2], { vertical: true, thick: 0.08, seed });
      a.add(new THREE.BoxGeometry(w - 0.1, h - 0.1, d - 0.2), dark, { p: [0, (h - 0.1) / 2, 0] }, { uvTile: WOOD_TILE, outline: false });
      a.add(board(w + 0.3, 0.12, d + 0.3, 0.04), m.wood(0x7a4a2a), { p: [0, h, 0] }, { uvTile: WOOD_TILE });
      a.add(tube([[-w / 2, 0.25, d / 2 + 0.25], [w / 2, 0.25, d / 2 + 0.25]], 0.035, 2, 6), m.metal(TONE.brass), {}, { outline: false });
      for (let i = 0; i < 5; i++) a.add(vessels.tankard(), m.wood(TONE.pale), { p: [-w / 2 + 0.5 + i * (w / 5), h + 0.06, 0.1 * (i % 2)] }, { outline: false });
      for (let i = 0; i < 4; i++) a.add(vessels.bottle(), m.toon(i % 2 ? 0x3f6b4a : 0x6b2a2a), { p: [w / 2 - 0.4 - i * 0.22, h + 0.06, -0.2] }, { outline: false });
      a.add(ribbed(lathe([[0.3, 0], [0.36, 0.3], [0.3, 0.6]], 12), 12, 0.02), m.wood(TONE.oak), { p: [-w / 2 + 0.4, h + 0.06, -0.15], r: [0, 0, Math.PI / 2] });
      return done('counter');
    }

    case 'table': {
      for (let i = 0; i < 3; i++) a.add(board(2.1, 0.09, 0.45), wood, { p: [0, 0.88, -0.48 + i * 0.48], r: rot(seed + i, 0.01) }, { uvTile: WOOD_TILE });
      for (const x of [-0.75, 0.75]) {
        a.add(slab([[-0.5, 0], [0.5, 0], [0.12, 0.84], [-0.12, 0.84]], 0.1), dark, { p: [x, 0, 0], r: [0, Math.PI / 2, 0] }, { uvTile: WOOD_TILE });
      }
      a.add(board(1.6, 0.1, 0.1), dark, { p: [0, 0.3, 0] }, { uvTile: WOOD_TILE });
      a.add(vessels.tankard(), m.wood(TONE.pale), { p: [-0.5, 0.93, 0.2] }, { outline: false });
      a.add(vessels.bowl(), m.toon(0xd8c8a8), { p: [0.3, 0.93, -0.1] }, { outline: false });
      a.add(vessels.loaf(), m.toon(0xc08a4a), { p: [0.3, 1.0, -0.1] }, { outline: false });
      const candle = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), m.glow(P.gold, 3));
      candle.position.set(0.05, 1.12, 0.25);
      candle.name = 'flame';
      a.add(lathe([[0.05, 0], [0.05, 0.14], [0, 0.14]], 8), m.toon(0xf3ead8), { p: [0.05, 0.93, 0.25] }, { outline: false });
      g.add(candle);
      return done('table');
    }

    case 'bench': {
      a.add(board(2, 0.1, 0.5), wood, { p: [0, 0.48, 0] }, { uvTile: WOOD_TILE });
      for (const x of [-0.75, 0.75]) a.add(slab([[-0.26, 0], [-0.14, 0], [-0.1, 0.18], [0.1, 0.18], [0.14, 0], [0.26, 0], [0.2, 0.44], [-0.2, 0.44]], 0.08), dark, { p: [x, 0, 0], r: [0, Math.PI / 2, 0] }, { uvTile: WOOD_TILE });
      a.add(board(1.5, 0.08, 0.08), dark, { p: [0, 0.22, 0] }, { uvTile: WOOD_TILE });
      return done('bench');
    }

    case 'hearth': {
      // Stone fireplace: hearth slab, stacked jambs, lintel, chimney breast, mantle, pot, logs, fire.
      const st = m.stone(0x7a7270);
      a.add(board(1.7, 0.25, 3.1, 0.05), st, { p: [0.15, 0.12, 0] }, { uvTile: STONE_TILE });
      for (const z of [-1.05, 1.05]) for (let k = 0; k < 4; k++) a.add(jitter(new THREE.BoxGeometry(1.1, 0.5, 0.75), 0.05, seed + k + z), st, { p: [0, 0.5 + k * 0.5, z] }, { uvTile: STONE_TILE });
      a.add(board(1.2, 0.5, 3.0, 0.06), st, { p: [0, 2.45, 0] }, { uvTile: STONE_TILE });
      a.add(new THREE.BoxGeometry(1.0, 2.6, 2.4), st, { p: [-0.2, 3.9, 0] }, { uvTile: STONE_TILE });
      a.add(board(1.9, 0.22, 3.3, 0.04), dark, { p: [0.15, 2.8, 0] }, { uvTile: WOOD_TILE });
      a.add(new THREE.BoxGeometry(0.2, 1.7, 1.4), m.toon(0x1a0c08), { p: [0.35, 1.1, 0] }, { outline: false });
      for (const [z, ry] of [[-0.25, 0.4], [0.25, -0.4]] as const) a.add(lathe([[0.11, 0], [0.12, 1.0]], 7), m.wood(TONE.oak), { p: [0.6, 0.35, z], r: [Math.PI / 2, ry, 0] });
      a.add(lathe([[0, 0], [0.2, 0.02], [0.26, 0.2], [0.2, 0.36], [0.22, 0.4], [0, 0.4]], 10), iron, { p: [0.6, 0.85, 0] });
      a.add(tube([[0.6, 1.25, 0], [0.6, 2.0, 0], [0.3, 2.2, 0]], 0.025, 6, 4), iron, {}, { outline: false });
      for (const [y, s, col, pw] of [[0.45, 1, P.ember, 2.6], [0.4, 0.62, P.gold, 3.2]] as const) {
        const flame = new THREE.Mesh(lathe([[0, 0], [0.32 * s, 0.18 * s], [0.26 * s, 0.5 * s], [0.08 * s, 0.85 * s], [0, 1.0 * s]], 7), m.glow(col, pw));
        flame.position.set(0.65, y, 0);
        flame.name = 'flame';
        g.add(flame);
      }
      const light = new THREE.PointLight(0xff8a3c, 7, 12, 1.5);
      light.position.set(1.4, 1.2, 0);
      g.add(light);
      return done('hearth');
    }

    case 'stall': {
      const awning = c('ember');
      // Trestle counter: plank top, plank front, cloth drape with a scalloped hem.
      for (let i = 0; i < 4; i++) a.add(board(3.5, 0.09, 0.56), wood, { p: [0, 1.0, -0.84 + i * 0.56], r: rot(seed + i, 0.01) }, { uvTile: WOOD_TILE });
      planks(a, wood, 3.4, 0.9, [0, 0.5, 1.1], { vertical: true, thick: 0.06, seed });
      a.add(new THREE.BoxGeometry(3.3, 0.9, 2.1), dark, { p: [0, 0.48, 0] }, { uvTile: WOOD_TILE, outline: false });
      const hem: [number, number][] = [[-1.75, 0]];
      for (let i = 0; i <= 14; i++) hem.push([-1.75 + (i / 14) * 3.5, -0.45 - (i % 2) * 0.12]);
      hem.push([1.75, 0]);
      a.add(slab(hem, 0.03), m.weave(awning), { p: [0, 0.98, 1.17] }, { outline: false });
      // Turned corner posts.
      for (const [x, z] of [[-1.85, -1.15], [1.85, -1.15], [-1.85, 1.15], [1.85, 1.15]] as const) a.add(turnedPost(z < 0 ? 3.15 : 2.45, 0.07), dark, { p: [x, 0, z] }, { uvTile: WOOD_TILE });
      // Curved striped canopy and a scalloped valance.
      // An arc of cloth: a slice of a cylinder laid along the stall, crowned over the counter.
      const canopy = new THREE.CylinderGeometry(3.2, 3.2, 4.1, 18, 1, true, -0.4, 0.8);
      canopy.rotateZ(Math.PI / 2);
      canopy.rotateX(-Math.PI / 2);
      const awningMat = m.painted(stripeTextureV(awning, P.light, 8), true);
      a.add(canopy, awningMat, { p: [0, -0.32, 0.1], r: [-0.1, 0, 0] });
      const val: [number, number][] = [[-2.05, 0]];
      for (let i = 0; i <= 16; i++) val.push([-2.05 + (i / 16) * 4.1, -0.32 - Math.abs(Math.sin((i / 16) * Math.PI * 8)) * 0.14]);
      val.push([2.05, 0]);
      a.add(slab(val, 0.03), m.weave(awning), { p: [0, 2.5, 1.32] }, { outline: false });
      // Wares: baskets of fruit, loaves, cheese, bottles, a hanging bundle of herbs and a price slate.
      goodsBasket(a, m, [-1.15, 1.05, 0.25], P.crimson, seed);
      goodsBasket(a, m, [-0.3, 1.05, 0.55], P.gold, seed + 3);
      for (let i = 0; i < 3; i++) a.add(vessels.loaf(), m.toon(0xc08a4a), { p: [0.55 + i * 0.32, 1.12, 0.35 + (i % 2) * 0.2], r: [0, i, 0] }, { outline: false });
      a.add(vessels.cheese(), m.toon(0xe8c45a), { p: [1.4, 1.05, -0.2] });
      for (let i = 0; i < 3; i++) a.add(vessels.bottle(), m.toon([0x3f6b4a, 0x6b2a2a, 0x4a3a6b][i]!), { p: [1.05 + i * 0.2, 1.05, -0.5] }, { outline: false });
      for (let i = 0; i < 3; i++) a.add(cluster([[0, 0, 0, 0.12], [0, -0.16, 0, 0.1]], seed + i), m.toon(i % 2 ? 0x6b7a3a : 0x8a6a3a), { p: [-1.2 + i * 1.1, 2.15, 1.05] }, { outline: false });
      a.add(lathe([[0.15, 0], [0.32, 0.36], [0.34, 0.4], [0, 0.4]], 10), m.weave(0xc0904a), { p: [2.25, 0, 0.9] });
      done();
      const slate = signBoard(m, 'FRESH', 0.7, 0.3, 'coin');
      slate.position.set(-1.4, 1.35, 1.12);
      slate.rotation.x = -0.25;
      g.add(slate);
      return g;
    }

    case 'well': {
      // Ring of dressed stones in two courses, a cap ring, water, timber frame, windlass, rope, bucket, shingled roof.
      const st = m.stone(0x857d78);
      for (let course = 0; course < 2; course++) {
        for (let k = 0; k < 12; k++) {
          const ang = (k / 12) * Math.PI * 2 + course * 0.26;
          a.add(jitter(new THREE.BoxGeometry(0.58, 0.42, 0.34), 0.04, seed + k + course * 20), st, { p: [Math.cos(ang) * 1.05, 0.22 + course * 0.42, Math.sin(ang) * 1.05], r: [0, -ang + Math.PI / 2, 0] }, { uvTile: STONE_TILE });
        }
      }
      a.add(new THREE.TorusGeometry(1.08, 0.13, 6, 20), m.stone(0x9a9284), { p: [0, 0.92, 0], r: [Math.PI / 2, 0, 0] });
      a.add(new THREE.CircleGeometry(0.92, 16), m.toon(0x1b2433), { p: [0, 0.7, 0], r: [-Math.PI / 2, 0, 0] }, { outline: false });
      for (const x of [-1.05, 1.05]) a.add(board(0.18, 2.6, 0.18), dark, { p: [x, 1.3, 0] }, { uvTile: WOOD_TILE });
      a.add(lathe([[0.1, -1.0], [0.12, -0.95], [0.12, 0.95], [0.1, 1.0]], 8), wood, { p: [0, 1.85, 0], r: [0, 0, Math.PI / 2] });
      a.add(tube([[1.1, 1.85, 0], [1.3, 1.85, 0], [1.3, 1.55, 0.1], [1.42, 1.55, 0.1]], 0.03, 6, 4), iron, {}, { outline: false });
      a.add(tube([[0.1, 1.75, 0], [0.12, 1.4, 0.02], [0.1, 1.1, 0]], 0.018, 6, 4), m.weave(TONE.burlap), {}, { outline: false });
      a.add(ribbed(lathe([[0.15, 0], [0.19, 0.3], [0.18, 0.32]], 10), 10, 0.03), wood, { p: [0.1, 0.8, 0] });
      a.add(new THREE.TorusGeometry(0.19, 0.015, 4, 12), iron, { p: [0.1, 1.08, 0], r: [Math.PI / 2, 0, 0] }, { outline: false });
      for (const s of [-1, 1]) a.add(board(2.7, 0.1, 1.5, 0.03), m.shingle(P.roof), { p: [0, 2.85, s * 0.55], r: [s * 0.62, 0, 0] }, { uvTile: 1.1 });
      a.add(board(2.8, 0.14, 0.18), dark, { p: [0, 3.3, 0] }, { uvTile: WOOD_TILE });
      return done('well');
    }

    case 'board': case 'signpost': {
      if (p.type === 'board') {
        // Notice board: two posts, a framed plank back, a little shingled roof, pinned notices.
        for (const x of [-1.05, 1.05]) a.add(board(0.16, 2.9, 0.16), dark, { p: [x, 1.45, 0] }, { uvTile: WOOD_TILE });
        planks(a, wood, 2.0, 1.3, [0, 2.0, 0], { thick: 0.07, seed });
        for (const y of [1.33, 2.67]) a.add(board(2.3, 0.12, 0.14), dark, { p: [0, y, 0.03] }, { uvTile: WOOD_TILE });
        for (const s of [-1, 1]) a.add(board(2.6, 0.08, 0.5, 0.02), m.shingle(P.roof), { p: [0, 2.98, s * 0.2], r: [s * 0.5, 0, 0] }, { uvTile: 1.1 });
        done('notice-board');
        for (let i = 0; i < 5; i++) {
          const note = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.55), m.painted(paperTexture(seed + i)));
          note.position.set(-0.72 + i * 0.36, 2.0 + (i % 2 ? 0.2 : -0.18), 0.05 + i * 0.002);
          note.rotation.z = (hash(seed + i) - 0.5) * 0.25;
          g.add(note);
        }
        if (p.label) labels.push({ text: p.label, position: new THREE.Vector3(p.at[0], 3.4, p.at[1]), kind: 'sign' });
        return g;
      }
      a.add(board(0.18, 2.6, 0.18), dark, { p: [0, 1.3, 0], r: rot(seed, 0.03) }, { uvTile: WOOD_TILE });
      a.add(lathe([[0.12, 0], [0.13, 0.08], [0, 0.22]], 6), dark, { p: [0, 2.6, 0] });
      a.add(jitter(new THREE.DodecahedronGeometry(0.35, 0), 0.08, seed), m.stone(0x6e6870), { p: [0.1, 0.12, 0.15] });
      done('signpost');
      // Arrow-shaped board with painted lettering.
      const arrowShape: [number, number][] = [[-0.8, -0.24], [0.6, -0.24], [0.85, 0], [0.6, 0.24], [-0.8, 0.24]];
      const arrow = m.kit(0.025);
      arrow.add(slab(arrowShape, 0.08), m.wood(TONE.oak), {}, { uvTile: WOOD_TILE });
      const arrowObj = arrow.build();
      arrowObj.position.set(0.45, 2.15, 0);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.42), m.painted(signTexture(p.label ?? 'Blackmere', 0xe8d4a8, 0x3a2416)));
      face.position.set(0.37, 2.15, 0.045);
      g.add(arrowObj, face);
      if (p.label) labels.push({ text: p.label, position: new THREE.Vector3(p.at[0], 3, p.at[1]), kind: 'sign' });
      return g;
    }

    case 'lamp': {
      // Iron lamp post: stone footing, turned shaft with collars, a scrolled bracket, a lantern.
      a.add(jitter(new THREE.CylinderGeometry(0.32, 0.4, 0.3, 8), 0.03, seed), m.stone(0x6e6870), { p: [0, 0.15, 0] }, { uvTile: STONE_TILE });
      a.add(lathe([[0.16, 0], [0.1, 0.25], [0.07, 0.3], [0.06, 3.1], [0.09, 3.15], [0.0, 3.2]], 8), iron, { p: [0, 0.28, 0] });
      for (const y of [1.0, 2.2]) a.add(new THREE.TorusGeometry(0.08, 0.025, 4, 10), iron, { p: [0, y, 0], r: [Math.PI / 2, 0, 0] }, { outline: false });
      a.add(tube([[0, 3.1, 0], [0.25, 3.35, 0], [0.55, 3.35, 0], [0.62, 3.2, 0]], 0.03, 10, 4), iron);
      a.add(tube([[0.05, 2.75, 0], [0.25, 2.95, 0], [0.18, 3.15, 0], [0.08, 3.05, 0]], 0.02, 10, 4), iron, {}, { outline: false });
      done('lamp');
      const head = lanternHead(m, 0.9);
      head.position.set(0.62, 2.78, 0);
      g.add(head);
      return g;
    }

    case 'lantern': {
      const hgt = p.size?.[2] ?? 3.4;
      for (let k = 0; k < 6; k++) a.add(new THREE.TorusGeometry(0.05, 0.015, 4, 8), iron, { p: [0, hgt + 0.6 + k * 0.13, 0], r: [0, k % 2 ? Math.PI / 2 : 0, 0] }, { outline: false });
      done('lantern');
      const head = lanternHead(m, 1);
      head.position.y = hgt;
      g.add(head);
      if (interior) {
        const l = new THREE.PointLight(0xffb060, 3.2, 8, 1.6);
        l.position.y = hgt - 0.4;
        g.add(l);
      }
      return g;
    }

    case 'crate': {
      // Slatted crate: corner posts, slats with gaps, a diagonal brace, produce on top.
      const s = 1;
      a.add(new THREE.BoxGeometry(0.9, 0.9, 0.9), m.wood(0x2e1d14), { p: [0, 0.5, 0] }, { outline: false });
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) a.add(board(0.14, s, 0.14), dark, { p: [x * 0.45, 0.5, z * 0.45] }, { uvTile: WOOD_TILE });
      for (const face of [0, 1, 2, 3]) {
        const ry = (face * Math.PI) / 2;
        for (let i = 0; i < 3; i++) {
          a.add(board(0.82, 0.24, 0.05), m.wood(TONE.pale), { p: [Math.sin(ry) * 0.47, 0.2 + i * 0.3, Math.cos(ry) * 0.47], r: [0, ry, (hash(seed + face * 3 + i) - 0.5) * 0.03] }, { uvTile: WOOD_TILE });
        }
      }
      a.add(board(1.15, 0.1, 0.06), dark, { p: [0, 0.5, 0.5], r: [0, 0, 0.75] }, { uvTile: WOOD_TILE, outline: false });
      for (let i = 0; i < 5; i++) a.add(vessels.apple(), m.toon(i % 2 ? P.crimson : P.ember), { p: [(hash(seed + i) - 0.5) * 0.5, 1.0, (hash(seed + i + 7) - 0.5) * 0.5] }, { outline: false });
      done('crate');
      g.rotation.y = (hash(seed) - 0.5) * 0.6;
      return g;
    }

    case 'barrel': {
      const body = lathe([[0.36, 0], [0.42, 0.14], [0.46, 0.52], [0.42, 0.9], [0.36, 1.04]], 16);
      const uv = body.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 2);
      a.add(body, m.textured(staveTexture(), 0xb07a4a));
      for (const [y, r] of [[0.12, 0.425], [0.3, 0.452], [0.74, 0.452], [0.92, 0.425]] as const) a.add(new THREE.TorusGeometry(r, 0.022, 4, 18), iron, { p: [0, y, 0], r: [Math.PI / 2, 0, 0] }, { outline: false });
      a.add(new THREE.CircleGeometry(0.35, 14), m.wood(TONE.pale), { p: [0, 1.0, 0], r: [-Math.PI / 2, 0, 0] }, { outline: false, uvTile: 0.9 });
      a.add(board(0.6, 0.04, 0.08), dark, { p: [0, 1.02, 0.05] }, { outline: false });
      return done('barrel');
    }

    case 'sack': {
      const body = jitter(ribbed(lathe([[0.0, 0], [0.36, 0.03], [0.46, 0.3], [0.42, 0.62], [0.2, 0.86], [0.12, 0.92], [0.22, 1.06], [0.0, 1.1]], 12), 5, 0.06), 0.04, seed);
      a.add(body, m.weave(TONE.burlap), {}, { uvTile: 0.6 });
      a.add(new THREE.TorusGeometry(0.13, 0.03, 4, 10), m.weave(0x8a6a3a), { p: [0, 0.9, 0], r: [Math.PI / 2, 0, 0] }, { outline: false });
      return done('sack');
    }

    case 'woodpile': {
      // Split logs stacked in courses, end grain showing, a chopping block and axe.
      const end = m.textured(endGrainTexture(), 0xc8a070);
      for (let i = 0; i < 10; i++) {
        const row = i < 4 ? 0 : i < 7 ? 1 : i < 9 ? 2 : 3;
        const col = i < 4 ? i : i < 7 ? i - 4 : i < 9 ? i - 7 : 0;
        const x = -0.66 + col * 0.42 + row * 0.21;
        const y = 0.2 + row * 0.36;
        a.add(jitter(new THREE.CylinderGeometry(0.19, 0.2, 1.5, 7), 0.03, seed + i), m.wood(i % 3 ? TONE.oak : TONE.darkOak), { p: [x, y, 0], r: [Math.PI / 2, 0, 0] }, { uvTile: WOOD_TILE });
        for (const z of [-0.76, 0.76]) a.add(new THREE.CircleGeometry(0.17, 7), end, { p: [x, y, z], r: [0, z > 0 ? 0 : Math.PI, 0] }, { outline: false });
      }
      a.add(lathe([[0.3, 0], [0.32, 0.5], [0, 0.5]], 9), m.wood(TONE.pale), { p: [1.25, 0, 0.3] });
      a.add(board(0.06, 0.7, 0.06), wood, { p: [1.25, 0.75, 0.3], r: [0, 0, 0.5] }, { outline: false });
      a.add(slab([[0, 0], [0.22, 0.05], [0.24, 0.2], [0, 0.12]], 0.03), iron, { p: [1.07, 0.98, 0.3], r: [0, 0, 0.5] }, { outline: false });
      return done('woodpile');
    }

    case 'pumpkins': {
      for (let i = 0; i < 4; i++) {
        const s = 0.28 + (i % 3) * 0.1;
        const pk = ribbed(lathe([[0, 0], [s * 0.7, s * 0.06], [s, s * 0.5], [s * 0.75, s * 1.0], [0.0, s * 1.05]], 16), 9, 0.07);
        const pos: V3 = [Math.cos(i * 1.9) * 0.45, 0, Math.sin(i * 1.9) * 0.45];
        a.add(pk, m.toon(i === 2 ? P.gold : P.ember), { p: pos, s: [1, 0.85, 1] });
        a.add(tube([[0, 0, 0], [0.02, 0.1, 0], [0.08, 0.16, 0]], 0.03, 4, 4), m.toon(TONE.leaf), { p: [pos[0], s * 0.88, pos[2]] }, { outline: false });
        a.add(slab([[0, 0], [0.18, 0.08], [0.24, 0.0], [0.16, -0.06]], 0.01), m.toon(TONE.leaf), { p: [pos[0] + 0.05, s * 0.9, pos[2]], r: [-1.2, i, 0] }, { outline: false });
      }
      return done('pumpkins');
    }

    case 'bush': {
      a.add(crownGeometry(seed, 0.6), m.toon(c('moss')), { p: [0, 0.55, 0], s: [1, 0.8, 1] });
      for (let i = 0; i < 6; i++) a.add(new THREE.SphereGeometry(0.06, 5, 4), m.toon(P.crimson), { p: [Math.cos(i * 1.7) * 0.6, 0.6 + (i % 3) * 0.15, Math.sin(i * 1.7) * 0.5] }, { outline: false });
      return done('bush');
    }

    case 'flowers': {
      for (let i = 0; i < 9; i++) {
        const x = Math.cos(i * 2.4) * (0.2 + (i % 3) * 0.2);
        const z = Math.sin(i * 2.4) * (0.2 + (i % 3) * 0.2);
        const hh = 0.3 + hash(seed + i) * 0.25;
        a.add(tube([[0, 0, 0], [0.03, hh / 2, 0], [0, hh, 0.02]], 0.015, 4, 3), m.toon(TONE.leaf), { p: [x, 0, z] }, { outline: false });
        const petals: [number, number][] = [];
        for (let k = 0; k < 10; k++) {
          const ang = (k / 10) * Math.PI * 2;
          const r = k % 2 ? 0.05 : 0.12;
          petals.push([Math.cos(ang) * r, Math.sin(ang) * r]);
        }
        a.add(slab(petals, 0.02), m.toon([P.gold, P.crimson, P.ember, 0xf3ead8][i % 4]!), { p: [x, hh, z], r: [-Math.PI / 2 + 0.3, 0, i] }, { outline: false });
      }
      a.add(cluster([[0, 0, 0, 0.25], [0.3, 0, 0.1, 0.2], [-0.25, 0, -0.1, 0.2]], seed), m.toon(TONE.leaf), { p: [0, 0.1, 0], s: [1, 0.5, 1] }, { outline: false });
      return done('flowers');
    }

    case 'planter': {
      const pw = w > 1 ? w : 1.6;
      planks(a, wood, pw, 0.45, [0, 0.23, 0.28], { thick: 0.06, seed });
      planks(a, wood, pw, 0.45, [0, 0.23, -0.28], { thick: 0.06, seed: seed + 5 });
      a.add(board(0.06, 0.45, 0.6), dark, { p: [-pw / 2, 0.23, 0] }, { uvTile: WOOD_TILE });
      a.add(board(0.06, 0.45, 0.6), dark, { p: [pw / 2, 0.23, 0] }, { uvTile: WOOD_TILE });
      a.add(new THREE.BoxGeometry(pw - 0.1, 0.05, 0.5), m.toon(TONE.soil), { p: [0, 0.42, 0] }, { outline: false });
      a.add(cluster([[-0.5, 0, 0, 0.2], [0, 0.05, 0, 0.22], [0.5, 0, 0, 0.2]], seed), m.toon(TONE.leaf), { p: [0, 0.55, 0] }, { outline: false });
      for (let i = 0; i < 7; i++) a.add(new THREE.IcosahedronGeometry(0.09, 0), m.toon(i % 2 ? P.crimson : P.gold), { p: [-pw / 2 + 0.25 + i * ((pw - 0.5) / 6), 0.72 + hash(seed + i) * 0.08, (hash(seed + i + 3) - 0.5) * 0.25] }, { outline: false });
      return done('planter');
    }

    case 'tree': {
      a.add(trunkGeometry(seed), m.wood(0x4a3020), {}, { uvTile: WOOD_TILE });
      a.add(crownGeometry(seed, 1.7), m.toon(c('ember')), { p: [0, 3.5, 0] });
      a.add(crownGeometry(seed + 9, 0.9), m.toon(new THREE.Color(c('ember')).multiplyScalar(1.25).getHex()), { p: [0.6, 4.6, 0.5] }, { outline: false });
      done('tree');
      g.scale.setScalar(0.95 + ((Math.abs(p.at[0] * 13 + p.at[1] * 7) % 10) / 10) * 0.35);
      g.rotation.y = p.at[0];
      return g;
    }

    case 'orchard': {
      a.add(trunkGeometry(seed, 2), m.wood(0x4a3020), {}, { uvTile: WOOD_TILE });
      a.add(crownGeometry(seed, 1.3), m.toon(0x6b7a34), { p: [0, 2.8, 0] });
      for (let i = 0; i < 9; i++) a.add(vessels.apple(), m.toon(P.crimson), { p: [Math.cos(i * 1.3) * 1.2, 2.4 + (i % 3) * 0.5, Math.sin(i * 1.3) * 1.2], s: 1.3 }, { outline: false });
      for (let i = 0; i < 4; i++) a.add(vessels.apple(), m.toon(P.crimson), { p: [Math.cos(i * 2) * 0.9, 0.08, Math.sin(i * 2) * 0.9] }, { outline: false });
      return done('orchard');
    }

    case 'deadwood': {
      const end = m.textured(endGrainTexture(), 0xc8a070);
      for (let i = 0; i < 4; i++) {
        const ry = i * 0.5;
        a.add(jitter(new THREE.CylinderGeometry(0.2, 0.24, 2, 7), 0.05, seed + i), m.wood(0x5a4030), { p: [0, 0.22 + i * 0.25, 0], r: [0, ry, Math.PI / 2] }, { uvTile: WOOD_TILE });
        a.add(new THREE.CircleGeometry(0.2, 7), end, { p: [Math.cos(ry), 0.22 + i * 0.25, -Math.sin(ry)], r: [0, ry + Math.PI / 2, 0] }, { outline: false });
      }
      for (let i = 0; i < 3; i++) a.add(lathe([[0.02, 0], [0.03, 0.12], [0.12, 0.13], [0.0, 0.2]], 8), m.toon(i % 2 ? 0xc04a2a : 0xe0c08a), { p: [0.5 + i * 0.2, 0, 0.45] }, { outline: false });
      return done('deadwood');
    }

    case 'field': {
      // Wheat rows: instanced tufts (one draw call per field).
      const tuft = grassTuftGeometry();
      const rows = 7;
      const per = Math.round(w / 0.55);
      const inst = new THREE.InstancedMesh(tuft, m.toon(c('gold')), rows * per);
      const dummy = new THREE.Object3D();
      let n = 0;
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < per; i++) {
          dummy.position.set(-w / 2 + (i + 0.5) * (w / per) + (hash(n) - 0.5) * 0.2, 0, -d / 2 + (r + 0.5) * (d / rows));
          dummy.scale.set(1.4, 1.6 + hash(n + 3) * 0.6, 1.4);
          dummy.rotation.y = hash(n + 5) * 6;
          dummy.updateMatrix();
          inst.setMatrixAt(n++, dummy.matrix);
        }
      }
      inst.castShadow = true;
      g.add(inst);
      for (let r = 0; r < rows; r++) a.add(new THREE.PlaneGeometry(w, d / rows - 0.5), m.toon(TONE.soil), { p: [0, 0.02, -d / 2 + (r + 0.5) * (d / rows)], r: [-Math.PI / 2, 0, 0] }, { outline: false });
      return done('field');
    }

    case 'fence': {
      // Split-rail fence: uneven pointed posts, two sagging rails.
      const tone = m.wood(TONE.weathered);
      const n = Math.max(2, Math.round(w / 1.8));
      for (let i = 0; i <= n; i++) {
        const x = -w / 2 + (i / n) * w;
        const ph = 1.15 + hash(seed + i) * 0.2;
        a.add(slab([[-0.08, 0], [0.08, 0], [0.08, ph - 0.12], [0, ph], [-0.08, ph - 0.12]], 0.14), tone, { p: [x, 0, 0], r: rot(seed + i, 0.08) }, { uvTile: WOOD_TILE });
      }
      for (let i = 0; i < n; i++) {
        const x0 = -w / 2 + (i / n) * w;
        for (const [y, k] of [[0.45, 0], [0.88, 1]] as const) a.add(board(w / n + 0.2, 0.11, 0.08), tone, { p: [x0 + w / n / 2, y + (hash(seed + i * 2 + k) - 0.5) * 0.08, 0.09], r: [0, 0, (hash(seed + i + k * 5) - 0.5) * 0.08] }, { uvTile: WOOD_TILE });
      }
      return done('fence');
    }

    case 'pen': {
      const tone = m.wood(TONE.weathered);
      for (const [x, z, len, ry] of [[0, -d / 2, w, 0], [0, d / 2, w, 0], [-w / 2, 0, d, Math.PI / 2], [w / 2, 0, d, Math.PI / 2]] as const) {
        const n = Math.max(2, Math.round(len / 1.8));
        for (let i = 0; i <= n; i++) {
          const t = -len / 2 + (i / n) * len;
          a.add(slab([[-0.07, 0], [0.07, 0], [0.07, 1.0], [0, 1.1], [-0.07, 1.0]], 0.12), tone, { p: [x + Math.cos(ry) * t, 0, z - Math.sin(ry) * t], r: [0, ry, 0] }, { uvTile: WOOD_TILE });
        }
        for (const y of [0.4, 0.8]) a.add(board(len, 0.1, 0.07), tone, { p: [x, y, z], r: [0, ry, 0] }, { uvTile: WOOD_TILE });
      }
      a.add(lathe([[0.5, 0], [0.55, 0.3], [0, 0.3]], 10), m.wood(TONE.pale), { p: [w * 0.3, 0, d * 0.2], s: [1.6, 1, 0.8] });
      return done('pen');
    }

    case 'rock': {
      a.add(facet(jitter(new THREE.DodecahedronGeometry(0.8, 1), 0.25, seed)), m.stone(0x6e6870), { p: [0, 0.35, 0], s: [1, 0.7, 0.9] }, { uvTile: STONE_TILE });
      a.add(cluster([[0, 0, 0, 0.3], [0.25, 0, 0.1, 0.22]], seed), m.toon(0x5a6a30), { p: [-0.1, 0.85, 0], s: [1.1, 0.35, 1] }, { outline: false });
      return done('rock');
    }

    case 'scarecrow': {
      a.add(board(0.14, 2.4, 0.14), dark, { p: [0, 1.2, 0] }, { uvTile: WOOD_TILE });
      a.add(board(1.9, 0.12, 0.12), dark, { p: [0, 1.85, 0] }, { uvTile: WOOD_TILE });
      a.add(jitter(lathe([[0.2, 0], [0.5, 0.1], [0.42, 0.7], [0.3, 0.95], [0.15, 1.0]], 10), 0.05, seed), m.weave(P.crimson), { p: [0, 1.0, 0] }, { uvTile: 0.6 });
      for (const s of [-1, 1]) a.add(lathe([[0.16, 0], [0.13, 0.7], [0.18, 0.75]], 8), m.weave(P.crimson), { p: [s * 0.18, 1.85, 0], r: [0, 0, -s * Math.PI / 2] }, { uvTile: 0.6 });
      for (const s of [-1, 1]) a.add(cluster([[0, 0, 0, 0.12], [0, -0.1, 0.05, 0.1]], seed + s), m.straw(), { p: [s * 0.98, 1.82, 0] }, { outline: false });
      a.add(jitter(new THREE.SphereGeometry(0.3, 10, 8), 0.04, seed), m.weave(TONE.burlap), { p: [0, 2.35, 0] }, { uvTile: 0.5 });
      for (const x of [-0.1, 0.1]) a.add(new THREE.BoxGeometry(0.07, 0.07, 0.04), m.toon(P.ink), { p: [x, 2.42, 0.28], r: [0, 0, 0.785] }, { outline: false });
      a.add(board(0.22, 0.03, 0.03), m.toon(P.ink), { p: [0, 2.25, 0.29] }, { outline: false });
      a.add(lathe([[0.55, 0], [0.5, 0.05], [0.24, 0.08], [0.22, 0.32], [0, 0.36]], 12), m.straw(), { p: [0, 2.52, 0], r: [0.15, 0, 0.1] }, { uvTile: 0.5 });
      return done('scarecrow');
    }

    case 'haystack': {
      a.add(cluster([[0, 0, 0, 1.05], [0.6, -0.25, 0.3, 0.7], [-0.55, -0.3, -0.2, 0.7], [0.1, 0.45, 0, 0.6]], seed), m.straw(), { p: [0, 0.55, 0], s: [1.1, 0.9, 1] }, { uvTile: 0.6 });
      a.add(lathe([[0.035, 0], [0.035, 1.9]], 5), m.wood(TONE.pale), { p: [0.6, 0.3, 0.8], r: [0.3, 0, -0.35] }, { outline: false });
      return done('haystack');
    }

    case 'cart': {
      // A broken-down cart: plank bed with side rails, spoked wheels, shafts, one wheel off.
      planks(a, wood, 1.4, 2.6, [0, 0.95, 0], { thick: 0.08, seed });
      for (const z of [-0.7, 0.7]) a.add(board(2.7, 0.35, 0.08), dark, { p: [0, 1.15, z] }, { uvTile: WOOD_TILE });
      for (const x of [-1.3, 1.3]) a.add(board(0.08, 0.35, 1.45), dark, { p: [x, 1.15, 0] }, { uvTile: WOOD_TILE });
      for (const z of [-0.45, 0.45]) a.add(board(2.2, 0.1, 0.1), dark, { p: [-2.1, 0.75, z], r: [0, 0, 0.18] }, { uvTile: WOOD_TILE });
      const wheel = (x: number, z: number, r: V3) => {
        a.add(new THREE.TorusGeometry(0.5, 0.07, 5, 16), dark, { p: [x, 0.5, z], r });
        a.add(lathe([[0.1, -0.12], [0.12, 0], [0.1, 0.12]], 8), dark, { p: [x, 0.5, z], r: [r[0] + Math.PI / 2, r[1], r[2]] }, { outline: false });
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI;
          a.add(board(0.06, 0.95, 0.05), wood, { p: [x, 0.5, z], r: [r[0], r[1], r[2] + ang] }, { outline: false });
        }
      };
      wheel(-0.85, 0.78, [0, 0, 0]);
      wheel(0.9, 0.78, [0, 0, 0.3]);
      a.add(new THREE.TorusGeometry(0.5, 0.07, 5, 16), dark, { p: [0.9, 0.08, -1.2], r: [Math.PI / 2, 0, 0] });
      a.add(jitter(ribbed(lathe([[0, 0], [0.3, 0.03], [0.36, 0.3], [0.2, 0.62], [0, 0.66]], 10), 5, 0.06), 0.03, seed), m.weave(TONE.burlap), { p: [0.3, 1.0, 0.1], r: [0, 0, 1.2] }, { uvTile: 0.6 });
      done('cart');
      g.rotation.z = 0.06; // the broken axle sags
      return g;
    }

    case 'bed': {
      a.add(board(2.0, 0.4, 3.0, 0.05), dark, { p: [0, 0.3, 0] }, { uvTile: WOOD_TILE });
      a.add(slab([[-1.0, 0], [1.0, 0], [1.0, 1.0], [0.6, 1.25], [-0.6, 1.25], [-1.0, 1.0]], 0.12), dark, { p: [0, 0, -1.5] }, { uvTile: WOOD_TILE });
      a.add(board(1.85, 0.25, 2.8, 0.1), m.weave(0xe8dcc0), { p: [0, 0.62, 0.05] }, { uvTile: 0.5 });
      a.add(jitter(board(1.95, 0.16, 2.0, 0.08), 0.03, seed), m.weave(c('crimson')), { p: [0, 0.78, 0.45] }, { uvTile: 0.5 });
      a.add(jitter(new THREE.SphereGeometry(0.4, 10, 6).scale(1.6, 0.4, 0.8), 0.03, seed), m.weave(0xf3ead8), { p: [0, 0.82, -1.05] }, { uvTile: 0.5 });
      return done('bed');
    }

    case 'chest': {
      a.add(board(1.2, 0.6, 0.8, 0.04), wood, { p: [0, 0.3, 0] }, { uvTile: WOOD_TILE });
      const lid = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12, 1, false, 0, Math.PI);
      lid.rotateZ(Math.PI / 2);
      lid.rotateX(Math.PI / 2);
      a.add(lid, wood, { p: [0, 0.6, 0] }, { uvTile: WOOD_TILE });
      for (const x of [-0.4, 0.4]) {
        a.add(board(0.1, 0.62, 0.84), iron, { p: [x, 0.3, 0] }, { outline: false });
        a.add(new THREE.TorusGeometry(0.42, 0.04, 4, 12, Math.PI), iron, { p: [x, 0.6, 0], r: [0, Math.PI / 2, 0] }, { outline: false });
      }
      a.add(board(0.2, 0.24, 0.06), m.metal(TONE.brass), { p: [0, 0.55, 0.42] }, { outline: false });
      return done('chest');
    }

    case 'shelf': {
      for (const x of [-1.05, 1.05]) a.add(board(0.1, 2.1, 0.45), dark, { p: [x, 1.05, 0] }, { uvTile: WOOD_TILE });
      for (const y of [0.1, 0.75, 1.4, 2.05]) a.add(board(2.2, 0.08, 0.45), wood, { p: [0, y, 0] }, { uvTile: WOOD_TILE });
      a.add(new THREE.BoxGeometry(2.1, 2.0, 0.04), m.wood(0x2e1d14), { p: [0, 1.05, -0.2] }, { outline: false });
      const glaze = [0x3f6b8a, P.ember, 0xe8dcc0, P.moss, P.crimson];
      for (let i = 0; i < 5; i++) a.add(vessels.jar(), m.toon(glaze[i]!), { p: [-0.8 + i * 0.36, 0.79, 0.05] }, { outline: false });
      for (let i = 0; i < 7; i++) a.add(board(0.12, 0.42 + hash(seed + i) * 0.12, 0.3), m.toon([P.crimson, 0x3f5a6b, P.moss, P.gold][i % 4]!), { p: [-0.9 + i * 0.14, 1.65, 0], r: [0, 0, i === 6 ? 0.3 : 0] }, { outline: false });
      a.add(vessels.bottle(), m.toon(0x3f6b4a), { p: [0.6, 1.44, 0] }, { outline: false });
      a.add(vessels.bowl(), m.toon(0xd8c8a8), { p: [0.3, 2.09, 0] }, { outline: false });
      return done('shelf');
    }

    case 'shrine': {
      a.add(board(1.0, 0.3, 0.8, 0.05), m.stone(0x7a7470), { p: [0, 0.15, 0] }, { uvTile: STONE_TILE });
      a.add(board(0.75, 0.9, 0.55, 0.05), m.stone(0x8a8276), { p: [0, 0.75, 0] }, { uvTile: STONE_TILE });
      a.add(new THREE.BoxGeometry(0.4, 0.5, 0.1), m.toon(0x2a1a14), { p: [0, 0.75, 0.25] }, { outline: false });
      for (const s of [-1, 1]) a.add(board(1.1, 0.07, 0.55, 0.02), m.shingle(0x4a5a2a), { p: [0, 1.38, s * 0.2], r: [s * 0.6, 0, 0] }, { uvTile: 1.1 });
      a.add(vessels.bowl(), m.toon(0xd8c8a8), { p: [0, 0.3, 0.42] }, { outline: false });
      a.add(vessels.apple(), m.toon(P.crimson), { p: [0, 0.4, 0.42] }, { outline: false });
      done('shrine');
      const candle = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), m.glow(P.gold, 3));
      candle.position.set(0.08, 0.92, 0.18);
      candle.name = 'flame';
      g.add(candle);
      return g;
    }

    case 'memorial': {
      a.add(board(1.1, 0.25, 0.8, 0.06), m.stone(0x6e6870), { p: [0, 0.12, 0] }, { uvTile: STONE_TILE });
      // A stele with a rounded head: base corners, then an arc from right to left.
      const stele: [number, number][] = [[-0.4, 0], [0.4, 0]];
      for (let k = 0; k <= 8; k++) stele.push([0.4 * Math.cos((k / 8) * Math.PI), 1.6 + Math.sin((k / 8) * Math.PI) * 0.4]);
      a.add(slab(stele, 0.3, 0.03), m.stone(0x8a8276), { p: [0, 0.25, 0] }, { uvTile: STONE_TILE });
      done('memorial');
      const runes = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.3), m.painted(runeTexture()));
      runes.position.set(0, 1.15, 0.19);
      g.add(runes);
      return g;
    }

    case 'boat': {
      // Rowboat: a tapered hull of planks, ribs, a thwart and two oars.
      const hull = new THREE.Shape();
      hull.moveTo(-1.6, 0);
      hull.quadraticCurveTo(-0.8, 0.75, 0.4, 0.7);
      hull.quadraticCurveTo(1.3, 0.6, 1.6, 0);
      hull.quadraticCurveTo(1.3, -0.6, 0.4, -0.7);
      hull.quadraticCurveTo(-0.8, -0.75, -1.6, 0);
      const geo = slabShape(hull, 0.55);
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) if (pos.getZ(i) < 0) pos.setXY(i, pos.getX(i) * 0.8, pos.getY(i) * 0.55);
      geo.computeVertexNormals();
      a.add(geo, m.wood(0x6b4a2e), { p: [0, 0.3, 0], r: [-Math.PI / 2, 0, 0] }, { uvTile: WOOD_TILE });
      a.add(new THREE.PlaneGeometry(2.4, 0.9), m.wood(0x3b2516), { p: [0, 0.5, 0], r: [-Math.PI / 2, 0, 0] }, { outline: false, uvTile: WOOD_TILE });
      a.add(board(0.25, 0.06, 1.25), wood, { p: [0.2, 0.6, 0] }, { uvTile: WOOD_TILE });
      for (const s of [-1, 1]) {
        a.add(lathe([[0.03, 0], [0.03, 2.1]], 5), m.wood(TONE.pale), { p: [0.2, 0.62, s * 0.3], r: [0, 0, Math.PI / 2 + s * 0.15] }, { outline: false });
        a.add(board(0.5, 0.03, 0.18), m.wood(TONE.pale), { p: [-1.6, 0.42, s * 0.62] }, { outline: false });
      }
      return done('boat');
    }

    case 'banner': {
      a.add(lathe([[0.12, 0], [0.07, 0.15], [0.05, 3.7], [0.0, 3.72]], 8), dark, {}, { uvTile: WOOD_TILE });
      a.add(new THREE.SphereGeometry(0.1, 8, 6), m.metal(TONE.brass), { p: [0, 3.8, 0] }, { outline: false });
      a.add(lathe([[0.03, -0.55], [0.03, 0.55]], 5), iron, { p: [0.45, 3.45, 0], r: [0, 0, Math.PI / 2] }, { outline: false });
      done('banner');
      const cloth = new THREE.Mesh(slab([[-0.4, 0], [0.4, 0], [0.4, -1.5], [0, -1.15], [-0.4, -1.5]], 0.02), m.painted(bannerTexture(c('crimson'), P.gold), true));
      const uv = cloth.geometry.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + 0.4) / 0.8, (uv.getY(i) + 1.5) / 1.5);
      cloth.position.set(0.45, 3.42, 0);
      cloth.name = 'banner-cloth';
      g.add(cloth);
      return g;
    }

    case 'bunting': {
      const span = p.size?.[0] ?? 8;
      const height = p.size?.[2] ?? 4.2;
      for (const x of [-span / 2, span / 2]) {
        a.add(lathe([[0.1, 0], [0.07, 0.2], [0.06, height], [0, height + 0.05]], 7), dark, { p: [x, 0, 0] }, { uvTile: WOOD_TILE });
        a.add(new THREE.SphereGeometry(0.08, 6, 5), m.metal(TONE.brass), { p: [x, height + 0.08, 0] }, { outline: false });
      }
      const ropePts: V3[] = [];
      for (let i = 0; i <= 12; i++) {
        const k = i / 12;
        ropePts.push([-span / 2 + k * span, height - 0.15 - Math.sin(k * Math.PI) * 0.7, 0]);
      }
      a.add(tube(ropePts, 0.02, 24, 4), m.weave(TONE.burlap), {}, { outline: false });
      done('bunting-poles');
      const string = new THREE.Group();
      string.name = 'bunting';
      const flags = Math.max(4, Math.round(span / 0.7));
      const colors = [P.crimson, P.gold, P.ember, P.light];
      const flagGeo = slab([[-0.22, 0], [0.22, 0], [0.04, -0.46], [0, -0.52], [-0.04, -0.46]], 0.01);
      for (let i = 0; i < flags; i++) {
        const k = (i + 0.5) / flags;
        const flag = new THREE.Mesh(flagGeo, m.weave(colors[i % colors.length]!));
        (flag.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
        flag.position.set(-span / 2 + k * span, height - 0.15 - Math.sin(k * Math.PI) * 0.7, 0);
        string.add(flag);
      }
      g.add(string);
      return g;
    }

    case 'rug': {
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m.painted(rugTexture(c('crimson'), P.gold, 0x3a2416)));
      rug.rotation.x = -Math.PI / 2;
      rug.position.y = 0.03;
      rug.receiveShadow = true;
      g.add(rug);
      return g;
    }
  }
  return g;
}
