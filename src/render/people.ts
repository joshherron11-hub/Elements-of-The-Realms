import * as THREE from 'three';
import type { Materials } from './materials';
import type { Garment, PersonLook } from './looks';
import { ease, shadowDisc, type PoseInput, type Rig } from './rig';
import { weaveTexture } from './textures';
import { board, cluster, hash, jitter, lathe, ribbed, slab, tube, type Assembly, type V3 } from './kit/geo';

/**
 * PEOPLE — original stylized characters built from a look (see `looks.ts`).
 *
 * A person is layered like real clothes: a base garment (tunic, dress or
 * robe), over-layers (doublet, vest, bodice, apron, tabard, mantle, cloak),
 * accessories (scarf, sash, belt pouch, satchel, pack, bedroll, chain of
 * office), a head with a face, hair, beard and hat, and something in hand.
 * Arms have elbows so people can stand with hands on hips, arms crossed,
 * hands behind the back, or hold what they carry in front of them.
 */

export type Role = 'player' | 'innkeeper' | 'merchant' | 'farmer' | 'courier' | 'official' | 'traveler' | 'villager' | 'patron';

/** The quick style used for townsfolk who have no authored look. */
export interface FigureStyle {
  body: number;
  accent: number;
  skin?: number;
  hair?: number;
  height?: number;
  role?: Role;
}

const SKIN = [0xe7c39a, 0xc99a6e, 0x9c6b48, 0xf0d2b0, 0xb07a52];
const HAIR = [0x3a2416, 0x6b3a1e, 0xc9a060, 0x2a1a1a, 0x8a4a2a, 0xb8b0a4];
const LEATHER = 0x3a2416;
const CREAM = 0xf3ead8;
const BRASS = 0xc9973a;

const WIDTH: Record<PersonLook['build'], number> = { slim: 0.86, average: 1, stout: 1.2, small: 0.95, tall: 0.95 };

function uvScale(geo: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

const cloth = (m: Materials, color: number) => m.character(color, weaveTexture());
const sc = (pts: [number, number][], k: number) => pts.map(([x, y]) => [x * k, y * k] as [number, number]);
const darker = (c: number, f = 0.75) => new THREE.Color(c).multiplyScalar(f).getHex();

/** Quick look for unnamed townsfolk and patrons (and the fallback for any NPC without one). */
export function lookFromStyle(style: FigureStyle): PersonLook {
  const seed = (style.body % 97) + (style.accent % 13) * 7;
  const role = style.role ?? 'villager';
  const base: PersonLook = {
    build: (['average', 'slim', 'stout'] as const)[seed % 3]!,
    height: style.height ?? 2.5,
    skin: style.skin ?? SKIN[seed % SKIN.length]!,
    hair: style.hair ?? HAIR[(seed >> 1) % HAIR.length]!,
    hairStyle: (['cropped', 'tousled', 'long', 'bun', 'ponytail'] as const)[seed % 5]!,
    beard: seed % 4 === 0 ? 'stubble' : 'none',
    hat: seed % 3 === 0 ? 'cap' : 'none',
    colors: { body: style.body, over: darker(style.body, 0.7), accent: style.accent, legs: 0x4a3a30, hat: style.accent },
    garments: seed % 2 ? ['tunic', 'vest', 'belt-pouch'] : ['tunic', 'scarf'],
    held: 'none',
    idle: 'relaxed',
  };
  switch (role) {
    case 'player': return { ...base, hat: 'hood', garments: ['tunic', 'cloak', 'scarf', 'belt-pouch', 'lantern'], build: 'average' };
    case 'innkeeper': return { ...base, hat: 'headscarf', hairStyle: 'bun', garments: ['dress', 'bodice', 'apron', 'rolled-sleeves'], idle: 'hips', held: 'tankard' };
    case 'merchant': return { ...base, hat: 'wide-brim', beard: 'moustache', garments: ['tunic', 'doublet', 'sash', 'pack'], idle: 'hold', held: 'ledger' };
    case 'farmer': return { ...base, hat: 'straw', hairStyle: 'braid', garments: ['dress', 'apron', 'rolled-sleeves'], held: 'pitchfork', idle: 'lean' };
    case 'courier': return { ...base, hat: 'cap', garments: ['tunic', 'vest', 'satchel', 'scarf'], held: 'letter', idle: 'hold', build: 'small' };
    case 'official': return { ...base, hat: 'tall', hairStyle: 'bald', beard: 'full', garments: ['robe', 'tabard', 'mantle', 'chain'], held: 'scroll', idle: 'behind' };
    case 'traveler': return { ...base, hat: 'hood', hairStyle: 'long', garments: ['tunic', 'cloak', 'sash', 'bedroll'], held: 'staff', idle: 'lean' };
    case 'patron': return { ...base, held: seed % 2 ? 'tankard' : 'none' };
    default: return base;
  }
}

/** A face that reads at distance: big eyes with catch-lights, brows, a strong nose, ears, cheeks, mouth. */
function face(a: Assembly, m: Materials, k: number, look: PersonLook, seed: number): void {
  const R = 0.34 * k;
  const skin = m.character(look.skin);
  const brow = look.hair === 0xb8b0a4 ? 0x7a7068 : darker(look.hair, 0.8);
  a.add(new THREE.SphereGeometry(R, 18, 14), skin, { s: [1, 1.08, 1] });
  // Jaw and chin give the face a direction even from above.
  a.add(new THREE.SphereGeometry(R * 0.7, 12, 10), skin, { p: [0, -0.15 * k, 0.1 * k], s: [1, 0.75, 1] }, { outline: false });
  a.add(lathe(sc([[0.065, 0], [0.06, 0.06], [0.035, 0.11], [0, 0.12]], k), 8), skin, { p: [0, -0.03 * k, R * 0.88], r: [Math.PI / 2 - 0.3, 0, 0] }, { outline: false });
  for (const x of [-1, 1]) {
    a.add(new THREE.SphereGeometry(0.08 * k, 8, 6), skin, { p: [x * R * 0.98, -0.01 * k, -0.02 * k], s: [0.45, 1, 0.75] }, { outline: false });
    a.add(new THREE.SphereGeometry(0.058 * k, 10, 8), m.toon(CREAM), { p: [x * 0.125 * k, 0.05 * k, R * 0.86], s: [0.85, 1.1, 0.5] }, { outline: false });
    a.add(new THREE.SphereGeometry(0.04 * k, 8, 6), m.toon(0x1a1014), { p: [x * 0.125 * k, 0.045 * k, R * 0.9], s: [0.9, 1.1, 0.5] }, { outline: false });
    a.add(new THREE.SphereGeometry(0.013 * k, 5, 4), m.glow(0xffffff, 1), { p: [x * 0.125 * k + 0.014 * k, 0.065 * k, R * 0.93] }, { outline: false });
    a.add(board(0.13 * k, 0.035 * k, 0.03 * k), m.toon(brow), { p: [x * 0.13 * k, 0.16 * k, R * 0.86], r: [0, 0, x * (-0.12 + (hash(seed) - 0.5) * 0.3)] }, { outline: false });
    a.add(new THREE.CircleGeometry(0.05 * k, 8), m.toon(0xe0907a), { p: [x * 0.2 * k, -0.08 * k, R * 0.8], r: [0, x * 0.55, 0] }, { outline: false });
  }
  a.add(tube([[-0.06 * k, 0, 0], [0, -0.02 * k, 0.01 * k], [0.06 * k, 0, 0]], 0.012 * k, 6, 3), m.toon(0x6a2a24), { p: [0, -0.16 * k, R * 0.86] }, { outline: false });
}

function hair(a: Assembly, m: Materials, k: number, look: PersonLook, seed: number, hooded: boolean): void {
  const R = 0.36 * k;
  const mat = m.character(look.hair);
  const s = look.hairStyle;
  if (!hooded && s !== 'bald') a.add(jitter(new THREE.SphereGeometry(R, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.56), 0.025 * k, seed), mat, { p: [0, 0.03 * k, -0.025 * k], s: [1.05, 1.07, 1.08] });
  if (s !== 'bald') {
    const fringe = s === 'tousled' ? [[-0.17, 0, 0, 0.13], [-0.04, 0.04, 0.02, 0.14], [0.1, 0.02, 0, 0.13], [0.2, -0.04, -0.04, 0.1]] : [[-0.15, 0, 0, 0.11], [0, 0.02, 0, 0.12], [0.15, 0, 0, 0.11]];
    a.add(cluster(fringe.map(([x, y, z, r]) => [x! * k, y! * k, z! * k, r! * k] as [number, number, number, number]), seed), mat, { p: [0, 0.2 * k, 0.24 * k] }, { outline: false });
  }
  if (s === 'bald') for (const x of [-1, 1]) a.add(cluster([[0, 0, 0, 0.08 * k], [0, -0.06 * k, -0.04 * k, 0.07 * k]], seed + x), mat, { p: [x * 0.3 * k, -0.02 * k, -0.08 * k] }, { outline: false });
  if (s === 'long') a.add(jitter(lathe(sc([[0.31, 0], [0.35, -0.25], [0.3, -0.55], [0.0, -0.6]], k), 12), 0.02 * k, seed), mat, { p: [0, 0.04 * k, -0.1 * k], s: [1, 1, 0.65] });
  if (s === 'bun') {
    a.add(new THREE.SphereGeometry(0.16 * k, 10, 8), mat, { p: [0, 0.24 * k, -0.3 * k] });
    a.add(new THREE.TorusGeometry(0.1 * k, 0.03 * k, 4, 10), m.character(look.colors.accent), { p: [0, 0.24 * k, -0.22 * k] }, { outline: false });
  }
  if (s === 'braid') {
    for (let i = 0; i < 5; i++) a.add(new THREE.SphereGeometry(0.075 * k, 7, 5), mat, { p: [0.12 * k, -0.08 * k - i * 0.11 * k, -0.24 * k + i * 0.04 * k] });
    a.add(new THREE.TorusGeometry(0.05 * k, 0.02 * k, 4, 8), m.character(look.colors.accent), { p: [0.12 * k, -0.62 * k, -0.04 * k], r: [Math.PI / 2, 0, 0] }, { outline: false });
  }
  if (s === 'ponytail') {
    a.add(tube([[0, 0.1 * k, -0.32 * k], [0, -0.1 * k, -0.42 * k], [0, -0.4 * k, -0.38 * k]], 0.075 * k, 8, 6), mat);
    a.add(new THREE.TorusGeometry(0.07 * k, 0.025 * k, 4, 8), m.character(look.colors.accent), { p: [0, 0.06 * k, -0.35 * k], r: [0.5, 0, 0] }, { outline: false });
  }
  if (look.beard === 'moustache') for (const x of [-1, 1]) a.add(tube([[0, 0, 0], [x * 0.08 * k, -0.025 * k, 0], [x * 0.15 * k, 0.025 * k, -0.02 * k]], 0.028 * k, 6, 4), mat, { p: [0, -0.1 * k, 0.33 * k] }, { outline: false });
  if (look.beard === 'full') a.add(cluster([[0, 0, 0, 0.17 * k], [-0.12 * k, 0.06 * k, -0.03 * k, 0.12 * k], [0.12 * k, 0.06 * k, -0.03 * k, 0.12 * k], [0, -0.13 * k, 0.02 * k, 0.11 * k]], seed), mat, { p: [0, -0.22 * k, 0.24 * k] });
  if (look.beard === 'stubble') a.add(new THREE.SphereGeometry(0.24 * k, 10, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), m.character(darker(look.skin, 0.82)), { p: [0, -0.06 * k, 0.07 * k] }, { outline: false });
}

function hat(a: Assembly, m: Materials, k: number, look: PersonLook, seed: number): void {
  const c = look.colors.hat;
  const L = (pts: [number, number][]) => sc(pts, k);
  switch (look.hat) {
    case 'hood': {
      // A hood open at the front (so the face shows), with a darker lining inside.
      const profile = L([[0.43, -0.22], [0.47, 0.02], [0.45, 0.24], [0.37, 0.42], [0.23, 0.55], [0.08, 0.61], [0.0, 0.61]]);
      const open = 0.95;
      const outer = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 18, open, Math.PI * 2 - open * 2);
      const lining = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r * 0.94), y)), 18, open, Math.PI * 2 - open * 2);
      lining.scale(-1, 1, 1); // flip faces inward so the inside shows through the opening
      a.add(uvScale(outer, 3, 1), m.character(c, weaveTexture()), { p: [0, 0.04 * k, -0.07 * k], r: [-0.15, 0, 0] });
      a.add(lining, m.glow(darker(c, 0.32), 1), { p: [0, 0.04 * k, -0.07 * k], r: [-0.15, 0, 0] }, { outline: false });
      a.add(tube([[0, 0.5 * k, -0.2 * k], [0, 0.52 * k, -0.42 * k], [0.04 * k, 0.32 * k, -0.6 * k], [0.06 * k, 0.1 * k, -0.62 * k]], 0.075 * k, 10, 6), m.character(c, weaveTexture()));
      a.add(new THREE.TorusGeometry(0.37 * k, 0.065 * k, 6, 18, Math.PI * 1.3), m.character(darker(c)), { p: [0, 0.02 * k, 0.2 * k], r: [0, 0, -Math.PI * 0.15] }, { outline: false });
      return;
    }
    case 'headscarf':
      a.add(jitter(new THREE.SphereGeometry(0.38 * k, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), 0.02 * k, seed), m.character(c, weaveTexture()), { p: [0, 0.04 * k, -0.04 * k], r: [-0.2, 0, 0] });
      a.add(cluster([[0, 0, 0, 0.09 * k], [0.08 * k, -0.06 * k, 0, 0.07 * k]], seed), m.character(c), { p: [0.05 * k, 0.1 * k, -0.38 * k] });
      a.add(slab(L([[0, 0], [0.08, 0], [0.06, -0.3], [0.0, -0.28]]), 0.02 * k), m.character(c), { p: [0.06 * k, 0.06 * k, -0.38 * k], r: [0.3, 0, 0.2] }, { outline: false });
      return;
    case 'wide-brim':
      a.add(lathe(L([[0.72, 0.03], [0.7, 0.06], [0.44, 0.06], [0.33, 0.08], [0.31, 0.36], [0.24, 0.43], [0.0, 0.44]]), 20), m.character(c), { p: [0, 0.23 * k, 0], r: [0.08, 0, 0.06] });
      a.add(new THREE.TorusGeometry(0.32 * k, 0.04 * k, 4, 16), m.character(look.colors.accent), { p: [0, 0.34 * k, 0], r: [Math.PI / 2 + 0.08, 0, 0] }, { outline: false });
      a.add(slab(L([[0, 0], [0.13, 0.32], [0.09, 0.66], [-0.03, 0.32]]), 0.02 * k), m.character(look.colors.accent), { p: [0.3 * k, 0.35 * k, -0.1 * k], r: [0, 0.3, -0.5] }, { outline: false });
      return;
    case 'straw':
      a.add(jitter(lathe(L([[0.64, 0.0], [0.6, 0.05], [0.31, 0.08], [0.27, 0.29], [0.12, 0.37], [0.0, 0.38]]), 18), 0.02 * k, seed), m.straw(c), { p: [0, 0.26 * k, 0], r: [0.12, 0, -0.05] });
      a.add(new THREE.TorusGeometry(0.28 * k, 0.04 * k, 4, 14), m.character(look.colors.accent), { p: [0, 0.37 * k, 0], r: [Math.PI / 2 + 0.12, 0, 0] }, { outline: false });
      return;
    case 'cap':
      a.add(uvScale(lathe(L([[0.38, 0], [0.37, 0.1], [0.29, 0.24], [0.0, 0.29]]), 14), 3, 1), m.character(c, weaveTexture()), { p: [0, 0.12 * k, -0.01 * k] });
      a.add(slab(L([[-0.21, 0], [0.21, 0], [0.17, 0.22], [-0.17, 0.22]]), 0.03 * k), m.character(darker(c)), { p: [0, 0.13 * k, 0.3 * k], r: [-Math.PI / 2 + 0.25, 0, 0] });
      a.add(new THREE.SphereGeometry(0.05 * k, 6, 5), m.character(look.colors.accent), { p: [0, 0.41 * k, 0] }, { outline: false });
      return;
    case 'tall':
      a.add(lathe(L([[0.37, 0], [0.36, 0.04], [0.27, 0.06], [0.29, 0.62], [0.31, 0.66], [0.0, 0.67]]), 16), m.character(c), { p: [0, 0.22 * k, 0] });
      a.add(new THREE.TorusGeometry(0.29 * k, 0.045 * k, 4, 16), m.character(look.colors.over), { p: [0, 0.36 * k, 0], r: [Math.PI / 2, 0, 0] });
      a.add(board(0.1 * k, 0.12 * k, 0.03 * k), m.metal(BRASS), { p: [0, 0.37 * k, 0.29 * k] }, { outline: false });
      return;
    default:
      return;
  }
}

/** Something carried in the right hand; returned as its own group so it can be attached to the hand. */
function heldItem(m: Materials, k: number, look: PersonLook): THREE.Group | undefined {
  const P = m.palette;
  const a = m.kit(0.025);
  const g = new THREE.Group();
  switch (look.held) {
    case 'tankard':
      a.add(lathe(sc([[0, 0], [0.1, 0], [0.11, 0.02], [0.1, 0.22], [0.11, 0.24], [0, 0.24]], k), 12), m.wood(0x9a7650));
      a.add(new THREE.TorusGeometry(0.06 * k, 0.018 * k, 4, 8, Math.PI), m.metal(0x34303a), { p: [0.11 * k, 0.12 * k, 0], r: [0, 0, -Math.PI / 2] }, { outline: false });
      for (const y of [0.04, 0.2]) a.add(new THREE.TorusGeometry(0.105 * k, 0.012 * k, 4, 12), m.metal(0x34303a), { p: [0, y * k, 0], r: [Math.PI / 2, 0, 0] }, { outline: false });
      a.add(new THREE.CircleGeometry(0.09 * k, 10), m.toon(0xf3e0b0), { p: [0, 0.235 * k, 0], r: [-Math.PI / 2, 0, 0] }, { outline: false });
      g.position.set(0, -0.12 * k, 0.08 * k);
      break;
    case 'letter':
      a.add(board(0.28 * k, 0.2 * k, 0.02 * k), m.toon(CREAM), {});
      a.add(new THREE.CylinderGeometry(0.035 * k, 0.035 * k, 0.012 * k, 8), m.toon(P.crimson), { p: [0, 0, 0.012 * k], r: [Math.PI / 2, 0, 0] }, { outline: false });
      g.position.set(0, -0.06 * k, 0.1 * k);
      g.rotation.set(-0.6, 0, 0.3);
      break;
    case 'scroll':
      a.add(lathe(sc([[0.045, -0.2], [0.05, -0.18], [0.05, 0.18], [0.045, 0.2]], k), 8), m.toon(CREAM), { r: [0, 0, Math.PI / 2] });
      a.add(new THREE.TorusGeometry(0.055 * k, 0.012 * k, 4, 8), m.character(P.crimson), { r: [0, Math.PI / 2, 0] }, { outline: false });
      g.position.set(0, -0.05 * k, 0.05 * k);
      break;
    case 'ledger':
      a.add(board(0.3 * k, 0.38 * k, 0.07 * k), m.character(0x5a2a24), {});
      a.add(board(0.27 * k, 0.35 * k, 0.05 * k), m.toon(CREAM), { p: [0.02 * k, 0, 0] }, { outline: false });
      g.position.set(0, -0.12 * k, 0.12 * k);
      g.rotation.set(-0.9, 0, 0);
      break;
    case 'basket':
      a.add(lathe(sc([[0, 0], [0.18, 0], [0.24, 0.18], [0.25, 0.2], [0, 0.2]], k), 12), m.weave(0xc0904a));
      a.add(new THREE.TorusGeometry(0.2 * k, 0.02 * k, 4, 12, Math.PI), m.weave(0x8a6a3a), { p: [0, 0.2 * k, 0] }, { outline: false });
      for (let i = 0; i < 5; i++) a.add(new THREE.SphereGeometry(0.07 * k, 7, 5), m.toon(P.crimson), { p: [Math.cos(i * 1.3) * 0.1 * k, 0.21 * k, Math.sin(i * 1.3) * 0.1 * k] }, { outline: false });
      g.position.set(0, -0.35 * k, 0);
      break;
    case 'staff':
      a.add(jitter(lathe(sc([[0.05, -1.45], [0.045, 0.6], [0.07, 0.7], [0.04, 0.85]], k), 6), 0.01, 3), m.wood(0x6b4428));
      a.add(tube([[0, 0.7 * k, 0], [0.08 * k, 0.8 * k, 0], [0.04 * k, 0.95 * k, 0]], 0.02 * k, 6, 3), m.metal(BRASS), {}, { outline: false });
      g.position.set(0, 0, 0.04 * k);
      break;
    case 'pitchfork': {
      a.add(lathe(sc([[0.04, -1.3], [0.04, 0.75]], k), 6), m.wood(0x8a6a44));
      a.add(board(0.34 * k, 0.05 * k, 0.05 * k), m.metal(0x5a5660), { p: [0, 0.77 * k, 0] }, { outline: false });
      for (const x of [-0.15, 0, 0.15]) a.add(lathe(sc([[0.018, 0], [0.012, 0.36], [0, 0.4]], k), 5), m.metal(0x5a5660), { p: [x * k, 0.78 * k, 0] }, { outline: false });
      g.position.set(0, 0, 0.04 * k);
      break;
    }
    case 'lantern': {
      a.add(lathe(sc([[0.1, 0], [0.12, 0.04], [0.12, 0.22], [0.14, 0.24], [0.04, 0.32], [0, 0.34]], k), 6), m.metal(0x34303a));
      const glass = new THREE.Mesh(lathe(sc([[0.09, 0.04], [0.1, 0.13], [0.09, 0.22]], k), 6), m.glow(P.gold, 3));
      g.add(glass);
      g.position.set(0, -0.35 * k, 0.05 * k);
      break;
    }
    default:
      return undefined;
  }
  g.add(a.build('held'));
  return g;
}

/** Build a person from a look. Height ~2.5 m (k = 1): readable on a phone. */
export function createPerson(m: Materials, look: PersonLook, seedIn = 1): THREE.Group {
  const P = m.palette;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const k = look.height / 2.5;
  const w = WIDTH[look.build];
  const seed = Math.abs(Math.round(seedIn)) % 997;
  const has = (g: Garment) => look.garments.includes(g);
  const L = (pts: [number, number][]) => sc(pts, k);
  const long = has('robe') ? 'robe' : has('dress') ? 'dress' : 'tunic';
  const hip = 0.98 * k;
  const legLen = 0.66 * k;
  const shoulder = hip + 0.76 * k;
  const headScale = look.build === 'small' ? 1.08 : 1;

  // Legs: tapered trousers, cuffed boots.
  const leg = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x * w, hip, 0);
    const a = m.kit(0.03);
    a.add(uvScale(lathe(L([[0.1, -0.66], [0.12, -0.45], [0.15, -0.12], [0.16, 0]]), 10), 3, 1), cloth(m, look.colors.legs));
    const boot: [number, number][] = [[-0.12, 0], [0.24, 0], [0.29, 0.06], [0.22, 0.13], [0.08, 0.15], [0.07, 0.34], [-0.12, 0.34]];
    a.add(slab(L(boot), 0.22 * k, 0.02 * k), m.character(LEATHER), { p: [0, -legLen - 0.06 * k, 0.02 * k], r: [0, -Math.PI / 2, 0] });
    a.add(lathe(L([[0.135, 0], [0.14, 0.06]]), 10), m.character(darker(LEATHER, 1.4)), { p: [0, -legLen + 0.22 * k, 0] }, { outline: false });
    pivot.add(a.build());
    return pivot;
  };
  const legL = leg(-0.17 * k);
  const legR = leg(0.17 * k);
  rig.add(legL, legR);

  // ── Torso: base garment ──
  const body = m.kit(0.045);
  const at = (y: number): V3 => [0, hip + y * k, 0];
  const S: V3 = [w, 1, w * 0.92];
  const hem = long === 'robe' ? -0.98 : long === 'dress' ? -0.9 : -0.3;
  const flare = long === 'robe' ? 0.62 : long === 'dress' ? 0.66 : 0.48;
  body.add(
    uvScale(ribbed(lathe(L([[flare, hem], [flare * 0.93, hem + 0.12], [0.44, 0], [0.38, 0.28], [0.43, 0.56], [0.45, 0.7], [0.36, 0.82], [0.16, 0.9], [0.0, 0.9]]), 16), long === 'tunic' ? 8 : 11, 0.03), 4, 2),
    cloth(m, look.colors.body),
    { p: at(0), s: S },
  );
  // Hem band.
  body.add(new THREE.TorusGeometry(flare * 0.97 * k, 0.03 * k, 4, 24), m.character(look.colors.accent), { p: at(hem + 0.02), r: [Math.PI / 2, 0, 0], s: [w, w * 0.92, 1] }, { outline: false });
  // Belt and buckle (everyone has one).
  body.add(new THREE.TorusGeometry(0.41 * k, 0.05 * k, 6, 20), m.character(LEATHER), { p: at(0.1), r: [Math.PI / 2, 0, 0], s: [w, w * 0.85, 1] }, { outline: false });
  body.add(board(0.14 * k, 0.12 * k, 0.04 * k), m.metal(BRASS), { p: [0, hip + 0.1 * k, 0.36 * k * w] }, { outline: false });
  body.add(lathe(L([[0.13, 0], [0.12, 0.16]]), 10), m.character(look.skin), { p: at(0.86) }, { outline: false });

  // ── Over-layers ──
  if (has('doublet')) {
    body.add(uvScale(ribbed(lathe(L([[0.52, -0.42], [0.48, -0.3], [0.46, 0], [0.41, 0.28], [0.46, 0.56], [0.48, 0.7], [0.39, 0.82], [0.2, 0.88]]), 16), 10, 0.025), 4, 2), cloth(m, look.colors.over), { p: at(0), s: S });
    body.add(board(0.07 * k, 1.15 * k, 0.03 * k), cloth(m, look.colors.accent), { p: [0, hip + 0.3 * k, 0.43 * k * w], r: [-0.05, 0, 0] }, { outline: false });
    for (let i = 0; i < 4; i++) body.add(new THREE.SphereGeometry(0.035 * k, 6, 5), m.metal(BRASS), { p: [0, hip + (0.65 - i * 0.18) * k, 0.46 * k * w] }, { outline: false });
  }
  if (has('vest')) {
    body.add(uvScale(lathe(L([[0.47, -0.12], [0.45, 0], [0.4, 0.28], [0.45, 0.56], [0.47, 0.68], [0.38, 0.77]]), 16), 4, 2), cloth(m, look.colors.over), { p: at(0), s: S });
    body.add(board(0.12 * k, 0.86 * k, 0.03 * k), cloth(m, look.colors.body), { p: [0, hip + 0.32 * k, 0.45 * k * w], r: [-0.05, 0, 0] }, { outline: false });
  }
  if (has('bodice')) {
    body.add(uvScale(lathe(L([[0.44, -0.04], [0.4, 0.25], [0.44, 0.5], [0.45, 0.6]]), 16), 4, 1), cloth(m, look.colors.over), { p: at(0), s: S });
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) body.add(board(0.16 * k, 0.02 * k, 0.02 * k), m.toon(look.colors.accent), { p: [0, hip + (0.1 + i * 0.15) * k, 0.4 * k * w], r: [0, 0, s * 0.6] }, { outline: false });
  }
  if (has('mantle')) body.add(uvScale(lathe(L([[0.58, -0.24], [0.54, -0.06], [0.42, 0.08], [0.22, 0.13]]), 16), 4, 1), cloth(m, look.colors.over), { p: at(0.78), s: [w, 1, w] });
  if (has('tabard')) {
    const panel = L([[-0.26, 0], [0.26, 0], [0.3, -1.25], [0, -1.35], [-0.3, -1.25]]);
    for (const s of [-1, 1]) {
      body.add(slab(panel, 0.03 * k, 0.005), cloth(m, look.colors.accent), { p: [0, hip + 0.72 * k, s * 0.43 * k * w], s: [1.08, 1.03, 1] }, { outline: false });
      body.add(slab(panel, 0.03 * k), cloth(m, look.colors.over), { p: [0, hip + 0.72 * k, s * 0.455 * k * w] });
    }
    body.add(new THREE.CylinderGeometry(0.1 * k, 0.1 * k, 0.02 * k, 12), m.metal(BRASS), { p: [0, hip + 0.3 * k, 0.48 * k * w], r: [Math.PI / 2, 0, 0] }, { outline: false });
  }
  if (has('apron')) {
    const bottom = long === 'tunic' ? -0.5 : -0.75;
    body.add(slab(L([[-0.3, 0], [0.3, 0], [0.34, bottom], [-0.34, bottom]]), 0.025 * k, 0.005), cloth(m, CREAM), { p: [0, hip + 0.12 * k, 0.44 * k * w], r: [-0.12, 0, 0] });
    if (long !== 'tunic') body.add(slab(L([[-0.2, 0], [0.2, 0], [0.22, -0.42], [-0.22, -0.42]]), 0.02 * k), cloth(m, CREAM), { p: [0, hip + 0.55 * k, 0.43 * k * w] }, { outline: false });
    body.add(board(0.22 * k, 0.16 * k, 0.03 * k), cloth(m, darker(CREAM, 0.85)), { p: [0.08 * k, hip - 0.18 * k, 0.5 * k * w], r: [-0.12, 0, 0] }, { outline: false });
  }
  if (has('cloak')) {
    const cape = new THREE.CylinderGeometry(0.45 * k * w, 0.66 * k * w, 1.3 * k, 18, 1, true, Math.PI * 0.5, Math.PI);
    body.add(uvScale(cape, 3, 2), m.character(look.colors.over, weaveTexture()), { p: [0, hip + 0.22 * k, -0.03 * k], r: [0.06, Math.PI, 0] }, { outline: false });
    for (const s of [-1, 1]) body.add(new THREE.SphereGeometry(0.05 * k, 8, 6), m.metal(BRASS), { p: [s * 0.18 * k, shoulder + 0.02 * k, 0.32 * k] }, { outline: false });
  }
  if (has('scarf')) {
    body.add(new THREE.TorusGeometry(0.28 * k, 0.1 * k, 8, 16), cloth(m, look.colors.accent), { p: [0, shoulder + 0.1 * k, 0], r: [Math.PI / 2, 0, 0] });
    body.add(slab(L([[-0.08, 0], [0.08, 0], [0.06, -0.42], [-0.06, -0.4]]), 0.04 * k), cloth(m, look.colors.accent), { p: [0.15 * k, shoulder + 0.06 * k, 0.32 * k], r: [0.2, 0, 0.15] }, { outline: false });
  }
  if (has('sash')) body.add(new THREE.TorusGeometry(0.48 * k * w, 0.05 * k, 6, 22), cloth(m, look.colors.accent), { p: at(0.42), r: [0.1, 0, 0.72] }, { outline: false });
  if (has('belt-pouch')) {
    body.add(board(0.2 * k, 0.22 * k, 0.12 * k, 0.03 * k), m.character(darker(LEATHER, 1.3)), { p: [-0.38 * k * w, hip - 0.02 * k, 0.16 * k] });
    body.add(slab(L([[-0.1, 0], [0.1, 0], [0.08, -0.1], [-0.08, -0.1]]), 0.015 * k), m.character(LEATHER), { p: [-0.38 * k * w, hip + 0.09 * k, 0.23 * k] }, { outline: false });
  }
  if (has('satchel')) {
    body.add(board(0.46 * k, 0.38 * k, 0.16 * k, 0.04 * k), m.character(LEATHER), { p: [0.44 * k * w, hip + 0.02 * k, 0.12 * k] });
    body.add(slab(L([[-0.23, 0], [0.23, 0], [0.18, -0.22], [-0.18, -0.22]]), 0.02 * k), m.character(0x5a3a24), { p: [0.44 * k * w, hip + 0.21 * k, 0.21 * k] }, { outline: false });
    for (let i = 0; i < 3; i++) body.add(board(0.14 * k, 0.18 * k, 0.01 * k), m.toon(CREAM), { p: [(0.36 + i * 0.06) * k * w, hip + 0.26 * k, 0.12 * k], r: [0, 0, (i - 1) * 0.2] }, { outline: false });
    body.add(new THREE.TorusGeometry(0.5 * k * w, 0.03 * k, 4, 20), m.character(LEATHER), { p: at(0.48), r: [0.1, 0, 0.75] }, { outline: false });
  }
  if (has('pack')) {
    body.add(board(0.55 * k * w, 0.68 * k, 0.32 * k, 0.05 * k), m.character(LEATHER), { p: [0, shoulder - 0.32 * k, -0.47 * k * w] });
    body.add(board(0.3 * k, 0.2 * k, 0.04 * k), m.character(darker(LEATHER, 1.3)), { p: [0, shoulder - 0.4 * k, -0.64 * k * w] }, { outline: false });
    for (let i = 0; i < 2; i++) body.add(lathe(L([[0.05, 0], [0.06, 0.3], [0.0, 0.32]]), 6), m.metal(0x7a5232), { p: [(i - 0.5) * 0.4 * k, shoulder - 0.1 * k, -0.5 * k * w] }, { outline: false });
  }
  if (has('bedroll')) body.add(uvScale(lathe(L([[0.13, -0.34], [0.14, -0.32], [0.14, 0.32], [0.13, 0.34]]), 12), 3, 1), cloth(m, look.colors.accent), { p: [0, shoulder + 0.05 * k, -0.42 * k * w], r: [0, 0, Math.PI / 2] });
  if (has('chain')) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 13) * Math.PI;
      body.add(new THREE.TorusGeometry(0.035 * k, 0.012 * k, 4, 8), m.metal(BRASS), { p: [Math.cos(a) * 0.3 * k, shoulder - 0.05 * k - Math.sin(a) * 0.22 * k, 0.32 * k + Math.sin(a) * 0.08 * k], r: [0, i % 2 ? Math.PI / 2 : 0, 0] }, { outline: false });
    }
    body.add(new THREE.CylinderGeometry(0.08 * k, 0.08 * k, 0.03 * k, 12), m.glow(P.gold, 1.3), { p: [0, shoulder - 0.3 * k, 0.42 * k], r: [Math.PI / 2, 0, 0] }, { outline: false });
  }
  if (has('lantern')) {
    // The traveller's own lantern: a warm glow at the hip that marks the player at any hour.
    body.add(lathe(L([[0.08, 0], [0.09, 0.03], [0.09, 0.16], [0.1, 0.18], [0.03, 0.24], [0, 0.25]]), 6), m.metal(0x34303a), { p: [0.4 * k * w, hip - 0.36 * k, 0.12 * k] });
  }

  // ── Arms with elbows ──
  const sleeve = has('doublet') ? look.colors.over : look.colors.body;
  const rolled = has('rolled-sleeves');
  const arm = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x * w, shoulder, 0);
    const up = m.kit(0.03);
    up.add(new THREE.SphereGeometry(0.15 * k, 10, 8), cloth(m, has('mantle') || has('cloak') ? look.colors.over : sleeve), { s: [1, 0.9, 1] });
    up.add(uvScale(lathe(L([[0.12, -0.38], [0.11, -0.3], [0.13, -0.05], [0.12, 0.05]]), 10), 3, 1), cloth(m, sleeve));
    pivot.add(up.build());
    const fore = new THREE.Group();
    fore.position.y = -0.36 * k;
    const lo = m.kit(0.03);
    lo.add(uvScale(lathe(L([[rolled ? 0.085 : 0.13, -0.3], [rolled ? 0.08 : 0.11, -0.22], [rolled ? 0.09 : 0.1, -0.02], [0.11, 0.02]]), 10), 3, 1), rolled ? m.character(look.skin) : cloth(m, sleeve));
    if (rolled) lo.add(new THREE.TorusGeometry(0.11 * k, 0.04 * k, 5, 12), cloth(m, sleeve), { r: [Math.PI / 2, 0, 0] }, { outline: false });
    else lo.add(new THREE.TorusGeometry(0.12 * k, 0.025 * k, 4, 12), m.character(look.colors.accent), { p: [0, -0.3 * k, 0], r: [Math.PI / 2, 0, 0] }, { outline: false });
    lo.add(new THREE.SphereGeometry(0.1 * k, 10, 8), m.character(look.skin), { p: [0, -0.4 * k, 0.02 * k], s: [0.9, 1.1, 0.75] });
    lo.add(new THREE.SphereGeometry(0.04 * k, 6, 5), m.character(look.skin), { p: [x > 0 ? -0.07 * k : 0.07 * k, -0.36 * k, 0.07 * k] }, { outline: false });
    fore.add(lo.build());
    pivot.add(fore);
    return { pivot, fore };
  };
  const left = arm(-0.46 * k);
  const right = arm(0.46 * k);
  rig.add(left.pivot, right.pivot);
  const item = heldItem(m, k, look);
  if (item) {
    item.position.y += -0.42 * k;
    right.fore.add(item);
  }

  // ── Head ──
  const head = new THREE.Group();
  head.position.y = shoulder + 0.44 * k;
  head.scale.setScalar(headScale);
  const ha = m.kit(0.035);
  face(ha, m, k, look, seed);
  hair(ha, m, k, look, seed, look.hat === 'hood');
  hat(ha, m, k, look, seed);
  head.add(ha.build('head'));
  rig.add(body.build('body'));
  rig.add(head);

  if (has('lantern')) {
    const glass = new THREE.Mesh(lathe(L([[0.065, 0.03], [0.075, 0.1], [0.065, 0.16]]), 6), m.glow(P.gold, 2.4));
    glass.position.set(0.4 * k * w, hip - 0.36 * k, 0.12 * k);
    rig.add(glass);
  }

  root.add(shadowDisc(0.8 * k * w));
  root.userData.rig = {
    rig, head, armL: left.pivot, armR: right.pivot, foreL: left.fore, foreR: right.fore, legL, legR,
    kind: 'person', idle: look.idle, seed: seed % 50,
  } satisfies Rig;
  return root;
}

/** Person from a quick style (townsfolk, patrons, fallback). */
export function createFigure(m: Materials, style: FigureStyle): THREE.Group {
  return createPerson(m, lookFromStyle(style), (style.body % 97) + (style.accent % 13) * 7 + Math.round((style.height ?? 2.5) * 10));
}

/** Colour styles per NPC tag; used when an NPC has no authored look. */
export function styleFor(m: Materials, tags: string[], isPlayer = false): FigureStyle {
  const P = m.palette;
  if (isPlayer) return { body: 0xefe2c6, accent: P.ember, role: 'player', height: 2.55, skin: 0xe7c39a };
  if (tags.includes('innkeeper')) return { body: P.crimson, accent: P.gold, role: 'innkeeper', hair: 0x8a4a2a };
  if (tags.includes('merchant')) return { body: P.gold, accent: 0x5a3a24, role: 'merchant', hair: 0x3a2416 };
  if (tags.includes('farmer')) return { body: P.moss, accent: 0xc9a060, role: 'farmer', hair: 0xc9a060 };
  if (tags.includes('courier')) return { body: P.ember, accent: 0x2a3a4a, role: 'courier', hair: 0x2a1a1a };
  if (tags.includes('official')) return { body: 0x2a2030, accent: P.crimson, role: 'official' };
  if (tags.includes('traveler')) return { body: 0x6a6a7a, accent: P.moss, role: 'traveler' };
  return { body: P.stone, accent: P.light, role: 'villager' };
}

/** Joint targets for an idle stance: [upperX, upperZ, foreX, foreY] for left and right arms. */
const STANCES: Record<string, { l: [number, number, number, number]; r: [number, number, number, number]; lean?: number }> = {
  relaxed: { l: [0.05, -0.1, -0.15, 0], r: [0.05, 0.1, -0.15, 0] },
  hips: { l: [0.15, -0.65, -0.25, 0], r: [0.15, 0.65, -0.25, 0] },
  crossed: { l: [-0.45, -0.15, -1.5, -0.9], r: [-0.45, 0.15, -1.5, 0.9] },
  behind: { l: [0.4, -0.12, -0.2, 0.9], r: [0.4, 0.12, -0.2, -0.9] },
  hold: { l: [0.05, -0.1, -0.2, 0], r: [-0.3, 0.12, -1.15, 0.2] },
  lean: { l: [0.05, -0.12, -0.2, 0], r: [-0.1, 0.3, -0.5, 0], lean: 0.05 },
};

/** Pose a person for this frame: walk, turn, idle stance, talk, look, sit, sleep. Visual only. */
export function animatePerson(r: Rig, root: THREE.Object3D, p: PoseInput): void {
  const t = p.t + r.seed;
  const rig = r.rig;
  const k = Math.min(1, (p.dt ?? 1 / 60) * 9);
  const shadow = root.getObjectByName('blob-shadow');
  if (p.sleeping) {
    rig.rotation.set(0, 0, Math.PI / 2);
    rig.position.set(1.15, 0.38, 0);
    rig.scale.y = 1 + Math.sin(t * 1.2) * 0.02;
    for (const l of [r.armL, r.armR, r.legL, r.legR, r.foreL, r.foreR]) if (l) l.rotation.set(0, 0, 0);
    if (r.head) r.head.rotation.set(0, 0, 0);
    if (shadow) shadow.scale.set(1.8, 1, 1);
    return;
  }
  if (shadow) shadow.scale.set(1, 1, 1);
  rig.rotation.z = 0;
  const w = Math.min(p.walk, 1.6);
  const moving = w > 0.05;
  const turning = !moving && Math.abs(p.turn ?? 0) > 0.012;
  const cadence = w > 1 ? 13 : 9;
  const phase = Math.sin(t * cadence);
  const swing = phase * 0.55 * Math.min(1, w);

  if (p.seated) {
    rig.position.set(0, -0.45, 0);
    ease(r.legL, 'x', -1.4, k);
    ease(r.legR, 'x', -1.4, k);
    ease(r.armL, 'x', -0.3, k);
    ease(r.armR, 'x', -0.35 + Math.max(0, Math.sin(t * 0.5)) * -0.4, k);
    ease(r.foreL, 'x', -0.9, k);
    ease(r.foreR, 'x', -1.0 - Math.max(0, Math.sin(t * 0.5)) * 0.6, k);
  } else if (moving) {
    rig.position.set(0, Math.abs(phase) * 0.09 * Math.min(1, w), 0);
    rig.rotation.y = phase * 0.07 * Math.min(1, w);
    ease(r.legL, 'x', swing, 0.6);
    ease(r.legR, 'x', -swing, 0.6);
    ease(r.armL, 'x', -swing * 0.75, 0.6);
    ease(r.armR, 'x', swing * 0.75, 0.6);
    ease(r.armL, 'z', -0.08, k);
    ease(r.armR, 'z', 0.08, k);
    ease(r.foreL, 'x', -0.35 - Math.max(0, -swing) * 0.4, 0.6);
    ease(r.foreR, 'x', -0.35 - Math.max(0, swing) * 0.4, 0.6);
    ease(r.foreL, 'y', 0, k);
    ease(r.foreR, 'y', 0, k);
  } else {
    // Idle stance with breathing and weight shift; small steps while turning on the spot.
    const st = STANCES[r.idle ?? 'relaxed'] ?? STANCES.relaxed!;
    const step = turning ? Math.sin(t * 16) * 0.3 : 0;
    rig.position.set(st.lean ? Math.sin(t * 0.4) * 0.04 : 0, turning ? Math.abs(Math.sin(t * 16)) * 0.04 : 0, 0);
    rig.rotation.y = 0;
    ease(r.legL, 'x', step + (st.lean ? -0.12 : 0), k);
    ease(r.legR, 'x', -step, k);
    const breathe = Math.sin(t * 1.9) * 0.03;
    const gesture = p.talking ? Math.max(0, Math.sin(t * 2.6)) : 0;
    ease(r.armL, 'x', st.l[0] + breathe, k);
    ease(r.armL, 'z', st.l[1], k);
    ease(r.foreL, 'x', st.l[2], k);
    ease(r.foreL, 'y', st.l[3], k);
    // Talking lifts the free hand in a gesture (unless arms are crossed or behind).
    const free = r.idle !== 'crossed' && r.idle !== 'behind';
    ease(r.armR, 'x', st.r[0] - breathe - (free ? gesture * 0.5 : 0), k);
    ease(r.armR, 'z', st.r[1] + (free ? gesture * 0.2 : 0), k);
    ease(r.foreR, 'x', st.r[2] - (free ? gesture * 0.7 : 0), k);
    ease(r.foreR, 'y', st.r[3], k);
    rig.rotation.z = st.lean ? st.lean : 0;
  }
  rig.scale.y = 1 + (!moving ? Math.sin(t * 1.9) * 0.01 : 0);
  rig.rotation.x = w > 1 ? 0.12 : moving ? 0.05 : 0;
  if (r.head) {
    const idleGlance = !moving && !p.talking && p.look === undefined ? Math.sin(t * 0.45) * 0.35 : 0;
    ease(r.head, 'y', Math.max(-0.9, Math.min(0.9, p.look ?? idleGlance)), k);
    ease(r.head, 'x', p.talking ? Math.sin(t * 3.1) * 0.08 : moving ? 0.05 : 0, k);
    ease(r.head, 'z', !moving && !p.talking ? Math.sin(t * 0.3) * 0.05 : 0, k);
  }
}
