import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * ART KIT — geometry.
 *
 * Small helpers that turn simple maths into handcrafted-looking shapes:
 * turned (lathe) profiles, rounded and chamfered boards, extruded outlines,
 * bent tubes, and a seeded "hand-made" jitter so nothing is perfectly
 * regular. `Assembly` merges every part of a prop that shares a material into
 * one mesh and draws one crack-free ink outline for the whole prop, so rich
 * props stay cheap (a few draw calls each).
 */

export type V3 = [number, number, number];

/** Presentation-only pseudo-random in [0,1). */
export const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Displace vertices a little, consistently per position, so seams never open. */
export function jitter(geo: THREE.BufferGeometry, amount: number, seed = 1): THREE.BufferGeometry {
  const g = geo;
  g.deleteAttribute('normal');
  const uv = g.getAttribute('uv');
  if (uv) g.deleteAttribute('uv');
  const merged = mergeVertices(g, 1e-4);
  const pos = merged.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = x * 12.9898 + y * 78.233 + z * 37.719 + seed * 3.17;
    pos.setXYZ(i, x + (hash(k) - 0.5) * amount, y + (hash(k + 1.3) - 0.5) * amount, z + (hash(k + 2.7) - 0.5) * amount);
  }
  merged.computeVertexNormals();
  return merged;
}

/** Faceted look: split vertices so each face is flat-lit. */
export function facet(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

/** A turned profile: [radius, height] pairs from bottom to top. */
export function lathe(profile: [number, number][], segments = 12): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), segments);
}

/** Radial ribs (pumpkins, sacks, barrels' staves): scale radius with angle. */
export function ribbed(geo: THREE.BufferGeometry, ribs: number, depth: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.cos(a * ribs) * depth;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A board with softened edges (ExtrudeGeometry with bevel), centred. */
export function board(w: number, h: number, d: number, bevel = Math.min(w, h, d) * 0.18): THREE.BufferGeometry {
  const b = Math.min(bevel, w / 2.2, h / 2.2, d / 2.2);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + b, -h / 2);
  shape.lineTo(w / 2 - b, -h / 2);
  shape.lineTo(w / 2, -h / 2 + b);
  shape.lineTo(w / 2, h / 2 - b);
  shape.lineTo(w / 2 - b, h / 2);
  shape.lineTo(-w / 2 + b, h / 2);
  shape.lineTo(-w / 2, h / 2 - b);
  shape.lineTo(-w / 2, -h / 2 + b);
  shape.closePath();
  const depth = Math.max(0.001, d - b * 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: 0, bevelSegments: 1 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** Extrude an outline (x, y points) to a depth, centred on z. */
export function slab(points: [number, number][], depth: number, bevel = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** Extrude a THREE.Shape (with holes, arcs) to a depth, centred on z. */
export function slabShape(shape: THREE.Shape, depth: number, bevel = 0): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** A bent rod through points (rope, iron scrollwork, branches, tails). */
export function tube(points: V3[], radius: number, segments = 12, radial = 5): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, segments, radius, radial, false);
}

/** A cluster of faceted blobs (tree crowns, bushes, wool, hay). */
export function cluster(blobs: [number, number, number, number][], seed = 1, detail = 0): THREE.BufferGeometry {
  const parts = blobs.map(([x, y, z, r], i) => {
    const g = jitter(new THREE.IcosahedronGeometry(r, detail), r * 0.28, seed + i);
    g.translate(x, y, z);
    return facet(g);
  });
  return mergeGeometries(parts.map(normalise))!;
}

/**
 * World-scaled UVs by box projection: each face takes the two axes it faces
 * along, so wood grain, stone courses and shingles keep one scale everywhere.
 */
export function projectUv(geo: THREE.BufferGeometry, tile: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let f = 0; f < pos.count; f += 3) {
    // Use the face normal so a triangle never straddles two projections.
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let k = 0; k < 3; k++) {
      nx += Math.abs(nor.getX(f + k));
      ny += Math.abs(nor.getY(f + k));
      nz += Math.abs(nor.getZ(f + k));
    }
    for (let k = 0; k < 3; k++) {
      const i = f + k;
      const [u, v] = ny >= nx && ny >= nz ? [pos.getX(i), pos.getZ(i)] : nx >= nz ? [pos.getZ(i), pos.getY(i)] : [pos.getX(i), pos.getY(i)];
      uv[i * 2] = u / tile;
      uv[i * 2 + 1] = v / tile;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Same attribute set everywhere (position, normal, uv) and non-indexed, ready to merge. */
export function normalise(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'outlineNormal' && name !== 'color') g.deleteAttribute(name);
  g.morphAttributes = {};
  g.clearGroups();
  g = g.index ? g.toNonIndexed() : g;
  return g;
}

/**
 * Smoothed normals for the outline shell: vertices that share a position share
 * one outline direction, so the ink hull never cracks at hard edges.
 */
export function withOutlineNormals(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const key = (i: number) => `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
  const sum = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const v = sum.get(k) ?? new THREE.Vector3();
    v.x += nor.getX(i);
    v.y += nor.getY(i);
    v.z += nor.getZ(i);
    sum.set(k, v);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = sum.get(key(i))!.clone().normalize();
    out.set([v.x, v.y, v.z], i * 3);
  }
  geo.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
  return geo;
}

export interface Place {
  p?: V3;
  r?: V3;
  s?: number | V3;
}

export function matrixOf(t: Place = {}): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const s = t.s === undefined ? [1, 1, 1] : typeof t.s === 'number' ? [t.s, t.s, t.s] : t.s;
  m.compose(new THREE.Vector3(...(t.p ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(t.r ?? [0, 0, 0]))), new THREE.Vector3(s[0], s[1], s[2]));
  return m;
}

interface Part {
  geo: THREE.BufferGeometry;
  outline: boolean;
}

/** Collects parts per material and merges them: a whole prop in a handful of draw calls. */
export class Assembly {
  private readonly parts = new Map<THREE.Material, Part[]>();

  /**
   * @param bake When given, every part's material colour is baked into vertex
   *   colours and the whole assembly is drawn with this one material: one mesh
   *   plus one outline, whatever the number of colours (used for characters).
   */
  constructor(
    private readonly outlineMaterial: (width: number) => THREE.Material,
    private readonly outlineWidth = 0.035,
    private readonly bake?: THREE.Material,
  ) {}

  /**
   * Add a part. `uvTile` re-projects UVs in world metres (for wood, stone and
   * other tiling materials); leave it out to keep the geometry's own UVs.
   */
  add(geo: THREE.BufferGeometry, material: THREE.Material, at: Place = {}, opts: { outline?: boolean; uvTile?: number } = {}): this {
    let g = geo.clone();
    g.applyMatrix4(matrixOf(at));
    g = normalise(g);
    if (opts.uvTile) g = projectUv(g, opts.uvTile);
    if (this.bake) {
      // Bake the part's colour into its vertices and draw it with the shared material.
      const col = ((material as THREE.Material & { color?: THREE.Color }).color ?? new THREE.Color(1, 1, 1)).clone();
      col.r = Math.min(col.r, 1.2);
      col.g = Math.min(col.g, 1.2);
      col.b = Math.min(col.b, 1.2);
      const n = g.getAttribute('position').count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      material = this.bake;
    }
    const list = this.parts.get(material) ?? [];
    list.push({ geo: g, outline: opts.outline ?? true });
    this.parts.set(material, list);
    return this;
  }

  build(name?: string): THREE.Group {
    const group = new THREE.Group();
    if (name) group.name = name;
    const outlined: THREE.BufferGeometry[] = [];
    for (const [material, list] of this.parts) {
      const merged = mergeGeometries(list.map((p) => p.geo))!;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      for (const p of list) if (p.outline) outlined.push(withOutlineNormals(p.geo.clone()));
    }
    if (outlined.length) {
      const shell = new THREE.Mesh(mergeGeometries(outlined)!, this.outlineMaterial(this.outlineWidth));
      shell.name = 'outline';
      group.add(shell);
    }
    return group;
  }
}
