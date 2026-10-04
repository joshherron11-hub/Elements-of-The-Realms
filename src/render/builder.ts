import * as THREE from 'three';
import type { Materials } from './materials';
import type { PropSpec, SceneLayout, Rect } from './layout';
import { footprint } from './footprint';
import { chevronDecal, cobbleTexture, dirtTexture, groundTexture, plankTexture, softDisc, sparkleDecal } from './textures';
import { buildProp, crownGeometry, grassTuftGeometry, leafGeometry, trunkGeometry } from './kit/props';

export interface Label {
  text: string;
  position: THREE.Vector3;
  kind: 'place' | 'sign';
}

export interface BuiltSection {
  group: THREE.Group;
  labels: Label[];
  /** Markers for resource nodes, keyed by node id, so they can show depletion. */
  nodeMarkers: Map<string, THREE.Object3D>;
  exitMarkers: THREE.Object3D[];
  /** Lamps and windows that light up at night. */
  nightLights: THREE.Object3D[];
  /** Water surfaces (animated). */
  water: THREE.Mesh[];
  /** Hearth lights (flicker). */
  fires: THREE.PointLight[];
}

/** Painted silhouette backdrop: a canvas texture on a far plane (2.5D layering). */
function backdrop(kind: 'hills' | 'treeline', color: number, width: number, height: number, seed: number): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.beginPath();
  ctx.moveTo(0, 256);
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  if (kind === 'hills') {
    for (let x = 0; x <= 1024; x += 16) ctx.lineTo(x, 110 + Math.sin(x / 140 + seed) * 50 + Math.sin(x / 47) * 12);
  } else {
    for (let x = 0; x <= 1024; x += 22) {
      const h = 60 + rnd() * 90;
      ctx.lineTo(x, 256 - h * 0.4);
      ctx.lineTo(x + 11, 256 - h);
    }
  }
  ctx.lineTo(1024, 256);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: true, depthWrite: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
}

/** Build one prop from the art kit and place it. */
function prop(m: Materials, p: PropSpec, labels: Label[], layout: SceneLayout): THREE.Object3D {
  const holder = new THREE.Group();
  holder.add(buildProp(m, p, labels, layout));
  holder.position.set(p.at[0], 0, p.at[1]);
  return holder;
}

/** Presentation-only pseudo-random in [0,1). */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Scale a plane's UVs so a shared tiling texture repeats every `tile` metres. */
function tileUv(geo: THREE.BufferGeometry, w: number, d: number, tile: number): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
  uv.needsUpdate = true;
  return geo;
}

function flat(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

function shadeHex(c: number, k: number): number {
  return new THREE.Color(c).multiplyScalar(k).getHex();
}

const inside = (x: number, z: number, [x0, z0, x1, z1]: Rect, pad = 0) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad;

/**
 * Ground scatter: grass tufts, pebbles and leaf drifts as three instanced
 * meshes (three draw calls for hundreds of pieces). Kept off paths, water,
 * exits and solid props.
 */
function scatter(layout: SceneLayout, m: Materials, density: number): THREE.Object3D[] {
  const P = m.palette;
  const [W, D] = layout.size;
  const solids = layout.props.map((p) => ({ p, fp: footprint(p) })).filter((x) => x.fp);
  const free = (x: number, z: number) =>
    !layout.paths.some((p) => inside(x, z, p.rect, 0.4)) &&
    !layout.water.some((r) => inside(x, z, r, 0.3)) &&
    !layout.exits.some((e) => Math.hypot(e.at[0] - x, e.at[1] - z) < e.radius + 0.5) &&
    !solids.some(({ p, fp }) => Math.abs(p.at[0] - x) < fp![0] / 2 + 0.3 && Math.abs(p.at[1] - z) < fp![1] / 2 + 0.3);
  const kinds = [
    { geo: grassTuftGeometry(), colors: [P.moss, P.gold, 0x7c7a3a, P.ember], n: 0.07, y: 0, s: [0.8, 1.6] },
    { geo: new THREE.DodecahedronGeometry(0.2, 0), colors: [P.stone, 0x6e6870, 0x8a8278], n: 0.02, y: 0.06, s: [0.6, 1.4] },
    { geo: leafGeometry(), colors: [P.ember, P.crimson, P.gold], n: 0.05, y: 0.03, s: [0.7, 1.3] },
  ];
  const out: THREE.Object3D[] = [];
  const mat = m.toon(0xffffff);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  kinds.forEach((k, ki) => {
    const want = Math.round(W * D * k.n * density);
    const mesh = new THREE.InstancedMesh(k.geo, mat, want);
    let n = 0;
    for (let i = 0; i < want * 3 && n < want; i++) {
      const x = (hash(i * 3.1 + ki * 101) - 0.5) * (W - 1);
      const z = (hash(i * 7.3 + ki * 53) - 0.5) * (D - 1);
      if (!free(x, z)) continue;
      const sc = k.s[0]! + hash(i + ki) * (k.s[1]! - k.s[0]!);
      dummy.position.set(x, k.y * sc, z);
      dummy.rotation.set(ki === 0 ? (hash(i + 5) - 0.5) * 0.4 : 0, hash(i + 9) * Math.PI * 2, 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      mesh.setColorAt(n, color.setHex(k.colors[Math.floor(hash(i + 17) * k.colors.length)]!));
      n++;
    }
    mesh.count = n;
    mesh.receiveShadow = true;
    out.push(mesh);
  });
  return out;
}

/**
 * The world beyond the walkable edge: a ring of autumn trees on three sides
 * and low hedges on the camera side (so they frame the view without hiding
 * the player). Instanced: a handful of draw calls.
 */
function surroundings(layout: SceneLayout, m: Materials, density: number): THREE.Object3D[] {
  const P = m.palette;
  const [W, D] = layout.size;
  const hw = W / 2;
  const hd = D / 2;
  const spots: { x: number; z: number; s: number; low: boolean }[] = [];
  const step = 4.6 / Math.max(0.6, density);
  let seed = 1;
  const band = (x0: number, x1: number, z0: number, z1: number, low: boolean) => {
    for (let x = x0; x <= x1; x += step) {
      for (let z = z0; z <= z1; z += step) {
        seed++;
        spots.push({ x: x + (hash(seed) - 0.5) * step * 0.8, z: z + (hash(seed + 0.5) - 0.5) * step * 0.8, s: 0.8 + hash(seed + 0.3) * 0.7, low });
      }
    }
  };
  band(-hw - 14, hw + 14, -hd - 16, -hd - 2.5, false); // far side
  band(-hw - 16, -hw - 2.5, -hd, hd + 4, false); // left
  band(hw + 2.5, hw + 16, -hd, hd + 4, false); // right
  band(-hw - 4, hw + 4, hd + 1.5, hd + 4, true); // near side: low hedges only
  const trees = spots.filter((s) => !s.low);
  const hedges = spots.filter((s) => s.low);
  const colors = [P.ember, P.gold, P.crimson, P.ember, 0x9a5a2a, P.moss];
  const out: THREE.Object3D[] = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const make = (geo: THREE.BufferGeometry, mat: THREE.Material, list: typeof spots, place: (d: THREE.Object3D, s: (typeof spots)[number], i: number) => void, tint?: (i: number) => number, cast = true) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((s, i) => {
      dummy.rotation.set(0, hash(i + 3) * 6.28, 0);
      dummy.scale.setScalar(s.s);
      place(dummy, s, i);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (tint) mesh.setColorAt(i, color.setHex(tint(i)));
    });
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    out.push(mesh);
  };
  const white = m.toon(0xffffff);
  const crown = crownGeometry(5, 1.8);
  const shell = crown.clone().scale(1.06, 1.06, 1.06);
  make(trunkGeometry(3, 2.6), m.wood(0x4a3020), trees, (d, s) => d.position.set(s.x, 0, s.z));
  make(crown, white, trees, (d, s) => d.position.set(s.x, 3.7 * s.s, s.z), (i) => colors[Math.floor(hash(i * 1.7) * colors.length)]!);
  make(shell, m.outline, trees, (d, s) => d.position.set(s.x, 3.7 * s.s, s.z), undefined, false);
  const hedge = crownGeometry(9, 0.75);
  make(hedge, white, hedges, (d, s) => d.position.set(s.x, 0.55, s.z), (i) => [P.moss, 0x7c7a3a, P.ember][i % 3]!);
  return out;
}

/** Build one walkable section from its layout. `density` scales decoration for the graphics preset. */
export function buildSection(layout: SceneLayout, m: Materials, density = 1): BuiltSection {
  const P = m.palette;
  const group = new THREE.Group();
  const labels: Label[] = [];
  const [W, D] = layout.size;
  const groundColor = m.color(layout.ground, 'ground');

  if (layout.interior) {
    const floor = flat(tileUv(new THREE.PlaneGeometry(W, D), W, D, 5), m.textured(plankTexture(groundColor)), 0, 0, 0);
    group.add(floor);
    // Dark warm surroundings instead of a black void.
    const outside = flat(new THREE.PlaneGeometry(W + 80, D + 80), new THREE.MeshBasicMaterial({ color: 0x1d120d }), 0, -0.05, 0);
    group.add(outside);
  } else {
    const tex = groundTexture(groundColor, [P.ember, P.gold, P.crimson]);
    group.add(flat(tileUv(new THREE.PlaneGeometry(W, D), W, D, 7), m.textured(tex), 0, 0, 0));
    // The land carries on past the walkable edge and fades into the fog.
    const skirt = flat(tileUv(new THREE.PlaneGeometry(W + 260, D + 260), W + 260, D + 260, 7), m.textured(tex, 0xd6c8b8), 0, -0.04, 0);
    group.add(skirt);
  }

  layout.paths.forEach((path, i) => {
    const [x0, z0, x1, z1] = path.rect;
    const w = x1 - x0;
    const d = z1 - z0;
    const base = m.color(path.color, 'path');
    const surface = path.surface ?? 'dirt';
    const lift = i * 0.002;
    if (surface !== 'plain') {
      // A darker kerb so walkways read clearly against the ground.
      group.add(flat(new THREE.PlaneGeometry(w + 0.7, d + 0.7), m.toon(shadeHex(base, 0.58)), (x0 + x1) / 2, 0.012 + lift, (z0 + z1) / 2));
    }
    const tex = surface === 'cobble' ? cobbleTexture(base, shadeHex(base, 0.5)) : surface === 'dirt' ? dirtTexture(base) : undefined;
    const mat = tex ? m.textured(tex) : m.toon(base);
    group.add(flat(tileUv(new THREE.PlaneGeometry(w, d), w, d, surface === 'cobble' ? 3 : 6), mat, (x0 + x1) / 2, 0.022 + lift, (z0 + z1) / 2));
  });

  layout.backdrops.forEach((b, i) => {
    const plane = backdrop(b.kind, m.color(b.color, 'crimson'), W * 2.6, b.height * 2.2, i * 7 + 3);
    plane.position.set(0, b.height * 0.9, -D / 2 - b.distance + 30);
    plane.name = 'backdrop';
    plane.userData.parallax = 0.25 + i * 0.25; // further layers follow the camera more (2.5D depth)
    group.add(plane);
  });

  for (const p of layout.props) group.add(prop(m, p, labels, layout));
  if (!layout.interior) {
    for (const o of scatter(layout, m, density)) group.add(o);
    for (const o of surroundings(layout, m, density)) group.add(o);
  }

  const nodeMarkers = new Map<string, THREE.Object3D>();
  for (const [id, at] of Object.entries(layout.nodes)) {
    // A soft scatter of glints on the ground: "something to gather here".
    const glint = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({ map: sparkleDecal(), color: P.gold, transparent: true, opacity: 0.75, depthWrite: false }));
    glint.rotation.x = -Math.PI / 2;
    glint.position.set(at[0], 0.05, at[1]);
    glint.name = 'node-glint';
    group.add(glint);
    nodeMarkers.set(id, glint);
  }

  const exitMarkers: THREE.Object3D[] = [];
  for (const e of layout.exits) {
    // Painted chevrons on the ground, pointing out of the section.
    const out = Math.atan2(-(e.at[0] - layout.playerStart[0]), -(e.at[1] - layout.playerStart[1]));
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(e.radius * 2.2, e.radius * 2.2), new THREE.MeshBasicMaterial({ map: chevronDecal(), color: P.gold, transparent: true, opacity: 0.4, depthWrite: false }));
    decal.rotation.set(-Math.PI / 2, 0, out);
    decal.position.set(e.at[0], 0.04, e.at[1]);
    decal.name = 'exit-glow';
    group.add(decal);
    exitMarkers.push(decal);
  }

  const nightLights: THREE.Object3D[] = [];
  const fires: THREE.PointLight[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.PointLight) fires.push(o);
    if (o.name === 'lamp-glow' || o.name === 'window-glow' || o.name === 'lamp-halo') nightLights.push(o);
  });

  const water: THREE.Mesh[] = [];
  for (const [x0, z0, x1, z1] of layout.water) {
    const bank = flat(new THREE.PlaneGeometry(x1 - x0 + 1.2, z1 - z0 + 1.2), m.toon(shadeHex(groundColor, 0.6)), (x0 + x1) / 2, 0.03, (z0 + z1) / 2);
    const surface = flat(new THREE.PlaneGeometry(x1 - x0, z1 - z0, 12, 12), new THREE.MeshToonMaterial({ color: 0x23304a, transparent: true, opacity: 0.94 }), (x0 + x1) / 2, 0.06, (z0 + z1) / 2);
    group.add(bank, surface);
    for (let k = 0; k < 3; k++) {
      const shine = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) * (0.25 + k * 0.12), 0.12), m.glow(P.light, 1.1, 0.4));
      shine.rotation.x = -Math.PI / 2;
      shine.position.set(x0 + (x1 - x0) * (0.3 + k * 0.2), 0.08, z0 + (z1 - z0) * (0.3 + k * 0.22));
      shine.name = 'water-shine';
      group.add(shine);
    }
    water.push(surface);
  }

  return { group, labels, nodeMarkers, exitMarkers, nightLights, water, fires };
}
