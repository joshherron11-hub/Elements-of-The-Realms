import * as THREE from 'three';
import type { FamiliarLook } from './looks';
import type { Materials } from './materials';
import { animatePerson } from './people';
import { animateHumanoid, humanoidOf } from './characters/humanoid';
import { ease, rigOf, shadowDisc, type PoseInput, type Rig } from './rig';
import { softDisc } from './textures';
import { cluster, lathe, slab, tube, type V3 } from './kit/geo';

/**
 * Familiars, animals, and the one animation entry point for every figure.
 * People are built in `people.ts`; the rig contract lives in `rig.ts`.
 *
 * Familiars have personalities in motion: Bramble the hound trots, sniffs,
 * sits when you stop, pants when happy, eats from a bowl, play-bows when you
 * bond, curls up to rest. Wick the lantern moth flutters, circles, brightens
 * when fed and loops for joy. Old Corvin the raven hops, tilts his head,
 * stretches a wing, caws, pecks, and flaps when pleased.
 */
export { createFigure, createPerson, lookFromStyle, styleFor, type FigureStyle, type Role } from './people';
export type { PoseInput } from './rig';

const DEFAULT_LOOKS: Record<string, FamiliarLook> = {
  hound: { coat: 0xc4562a, marking: 0xf6ead6, accent: 0xa3302a },
  moth: { coat: 0xf6d07a, marking: 0x8a3a1a, accent: 0xffd9a8 },
  raven: { coat: 0x26222c, marking: 0x9a9284, accent: 0xe8b04a },
};

/** Leg pivot with a tapered leg and a paw. */
function pawLeg(m: Materials, color: number, paw: number, at: V3, len: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(...at);
  const a = m.figureKit(0.025);
  a.add(lathe([[0.06, -len], [0.07, -len * 0.6], [0.1, -len * 0.15], [0.09, 0]], 8), m.character(color));
  a.add(new THREE.SphereGeometry(0.075, 8, 6), m.character(paw), { p: [0, -len, 0.03], s: [1, 0.6, 1.3] });
  pivot.add(a.build());
  return pivot;
}

function eye(m: Materials, a: ReturnType<Materials['kit']>, at: V3, r: number, color = 0x1a1014): void {
  a.add(new THREE.SphereGeometry(r, 8, 6), m.toon(color), { p: at }, { outline: false });
  a.add(new THREE.SphereGeometry(r * 0.32, 5, 4), m.glow(0xffffff, 1), { p: [at[0] + r * 0.3, at[1] + r * 0.4, at[2] + r * 0.7] }, { outline: false });
}

/** Original Familiar figures: a russet hound, a lantern moth, a keep raven. */
export function createFamiliarFigure(m: Materials, figure: string, look?: FamiliarLook): THREE.Group {
  const P = m.palette;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  if (figure === 'hound') {
    const L = look ?? DEFAULT_LOOKS.hound!;
    const a = m.figureKit(0.04);
    a.add(lathe([[0.05, -0.55], [0.2, -0.48], [0.25, -0.25], [0.24, 0.0], [0.31, 0.25], [0.29, 0.42], [0.14, 0.56], [0.0, 0.58]], 14), m.character(L.coat), { p: [0, 0.68, 0], r: [Math.PI / 2, 0, 0] });
    a.add(new THREE.SphereGeometry(0.22, 10, 8), m.character(L.marking), { p: [0, 0.6, 0.4], s: [0.9, 1, 0.8] }, { outline: false });
    a.add(cluster([[0, 0, 0, 0.12], [0.1, -0.04, 0.05, 0.1]], 4), m.character(L.marking), { p: [0.08, 0.84, -0.2], s: [1, 0.5, 1.2] }, { outline: false });
    a.add(new THREE.TorusGeometry(0.2, 0.05, 6, 16), m.character(L.accent), { p: [0, 0.86, 0.48], r: [1.2, 0, 0] }, { outline: false });
    a.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), m.metal(0xc9973a), { p: [0, 0.68, 0.64], r: [1.3, 0, 0] }, { outline: false });
    rig.add(a.build('hound-body'));
    const head = new THREE.Group();
    head.position.set(0, 1.0, 0.62);
    const ha = m.figureKit(0.035);
    ha.add(new THREE.SphereGeometry(0.25, 12, 10), m.character(L.coat), { s: [1, 0.95, 1.05] });
    ha.add(slab([[-0.06, 0.2], [0.06, 0.2], [0.09, -0.05], [0, -0.12], [-0.09, -0.05]], 0.02), m.character(L.marking), { p: [0, 0.06, 0.22], r: [-0.4, 0, 0] }, { outline: false });
    ha.add(lathe([[0.15, 0], [0.14, 0.12], [0.11, 0.24], [0.06, 0.3], [0.0, 0.31]], 10), m.character(L.marking), { p: [0, -0.05, 0.15], r: [Math.PI / 2, 0, 0] });
    ha.add(new THREE.SphereGeometry(0.06, 8, 6), m.toon(0x1a1014), { p: [0, -0.02, 0.46], s: [1.2, 0.9, 1] }, { outline: false });
    for (const x of [-1, 1]) eye(m, ha, [x * 0.11, 0.07, 0.21], 0.048);
    head.add(ha.build('hound-head'));
    // Floppy ears on their own pivots.
    const ears: THREE.Object3D[] = [];
    for (const x of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(x * 0.18, 0.15, -0.02);
      const ea = m.figureKit(0.025);
      ea.add(slab(([[0, 0], [0.12, -0.05], [0.14, -0.3], [0.04, -0.38], [-0.04, -0.2]] as [number, number][]).map(([px, py]) => [px * x, py] as [number, number]), 0.04), m.character(new THREE.Color(L.coat).multiplyScalar(0.7).getHex()), { r: [0, x * 0.3, 0] });
      ear.add(ea.build());
      ear.rotation.z = x * -0.35;
      head.add(ear);
      ears.push(ear);
    }
    // Jaw with a tongue (pants when happy).
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.13, 0.18);
    const ja = m.figureKit(0.02);
    ja.add(lathe([[0.1, 0], [0.09, 0.12], [0.05, 0.22], [0, 0.23]], 8), m.character(L.marking), { r: [Math.PI / 2, 0, 0], s: [1, 1, 0.55] });
    jaw.add(ja.build());
    const tongue = new THREE.Mesh(slab([[-0.05, 0], [0.05, 0], [0.05, -0.14], [0, -0.17], [-0.05, -0.14]], 0.015), m.character(0xe06a6a));
    tongue.position.set(0, -0.02, 0.2);
    tongue.rotation.x = -1.2;
    tongue.visible = false;
    jaw.add(tongue);
    head.add(jaw);
    rig.add(head);
    const legs = ([[-0.15, 0.55, 0.32], [0.15, 0.55, -0.34], [0.15, 0.55, 0.32], [-0.15, 0.55, -0.34]] as V3[]).map((at) => pawLeg(m, L.coat, L.marking, at, 0.42));
    for (const l of legs) rig.add(l);
    const tail = new THREE.Group();
    tail.position.set(0, 0.8, -0.5);
    const ta = m.figureKit(0.025);
    ta.add(tube([[0, 0, 0], [0, 0.15, -0.15], [0, 0.35, -0.2], [0, 0.5, -0.12]], 0.06, 10, 6), m.character(L.coat));
    ta.add(new THREE.SphereGeometry(0.07, 8, 6), m.character(L.marking), { p: [0, 0.5, -0.12] }, { outline: false });
    tail.add(ta.build());
    rig.add(tail);
    // A food bowl that appears while eating.
    const bowl = new THREE.Group();
    const ba = m.figureKit(0.02);
    ba.add(lathe([[0, 0], [0.16, 0], [0.24, 0.08], [0.26, 0.12], [0.2, 0.1], [0, 0.1]], 14), m.toon(0x8a5a3a));
    ba.add(cluster([[0, 0, 0, 0.07], [0.07, 0, 0.03, 0.05], [-0.06, 0, -0.03, 0.05]], 2), m.toon(0xc08a4a), { p: [0, 0.1, 0] }, { outline: false });
    bowl.add(ba.build());
    bowl.position.set(0, 0, 1.05);
    bowl.visible = false;
    root.add(bowl);
    root.add(shadowDisc(0.75));
    root.userData.rig = { rig, head, tail, legs, ears, jaw, tongue, bowl, kind: 'hound', seed: 3 } satisfies Rig;
  } else if (figure === 'moth') {
    const L = look ?? DEFAULT_LOOKS.moth!;
    const body = new THREE.Mesh(lathe([[0, -0.26], [0.07, -0.2], [0.1, -0.05], [0.09, 0.08], [0.11, 0.14], [0.08, 0.22], [0, 0.26]], 10), m.glow(L.accent, 1.6));
    body.rotation.x = Math.PI / 2;
    rig.add(body);
    const ant = m.figureKit(0.01);
    for (const x of [-1, 1]) {
      ant.add(tube([[0, 0, 0.24], [x * 0.08, 0.12, 0.36], [x * 0.18, 0.18, 0.4]], 0.012, 8, 3), m.toon(P.gold), {}, { outline: false });
      for (let i = 1; i < 4; i++) ant.add(slab([[0, 0], [0.05, 0.02], [0.0, 0.05]], 0.005), m.toon(P.gold), { p: [x * (0.05 + i * 0.04), 0.1 + i * 0.025, 0.33 + i * 0.02], r: [0, 0, x * 0.4] }, { outline: false });
    }
    rig.add(ant.build());
    const wings: THREE.Object3D[] = [];
    const wingShape: [number, number][] = [[0, 0.04], [0.18, 0.22], [0.42, 0.3], [0.56, 0.18], [0.5, 0.0], [0.38, -0.12], [0.44, -0.3], [0.3, -0.38], [0.12, -0.24], [0, -0.06]];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const wing = new THREE.Mesh(slab(wingShape.map(([x, y]) => [x * side, y] as [number, number]), 0.01), new THREE.MeshBasicMaterial({ color: new THREE.Color(L.coat).multiplyScalar(1.6), transparent: true, opacity: 0.82, side: THREE.DoubleSide, toneMapped: false }));
      wing.rotation.x = -Math.PI / 2;
      pivot.add(wing);
      for (const [px, pz, r] of [[0.3, -0.1, 0.06], [0.42, 0.14, 0.04]] as const) {
        const spot = new THREE.Mesh(new THREE.CircleGeometry(r, 10), new THREE.MeshBasicMaterial({ color: L.marking, side: THREE.DoubleSide }));
        spot.rotation.x = -Math.PI / 2;
        spot.position.set(side * px, 0.012, pz);
        pivot.add(spot);
      }
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
    const L = look ?? DEFAULT_LOOKS.raven!;
    const a = m.figureKit(0.035);
    a.add(lathe([[0.0, -0.42], [0.16, -0.3], [0.27, -0.05], [0.26, 0.15], [0.16, 0.3], [0.0, 0.34]], 12), m.character(L.coat), { p: [0, 0.5, 0], r: [Math.PI / 2 - 0.35, 0, 0] });
    a.add(cluster([[0, 0, 0, 0.13], [0.08, -0.06, 0.02, 0.1], [-0.08, -0.06, 0.02, 0.1]], 6), m.character(L.coat), { p: [0, 0.62, 0.22] }, { outline: false });
    a.add(slab([[-0.2, 0], [0.2, 0], [0.24, -0.38], [0.08, -0.3], [0, -0.42], [-0.08, -0.3], [-0.24, -0.38]], 0.03), m.character(L.coat), { p: [0, 0.4, -0.35], r: [-Math.PI / 2 + 0.5, 0, 0] });
    for (const x of [-0.08, 0.08]) a.add(tube([[x, 0.28, 0.04], [x, 0.12, 0.06], [x, 0.0, 0.1]], 0.02, 4, 3), m.toon(L.accent), {}, { outline: false });
    rig.add(a.build('raven-body'));
    const head = new THREE.Group();
    head.position.set(0, 0.86, 0.3);
    const ha = m.figureKit(0.03);
    ha.add(new THREE.SphereGeometry(0.19, 10, 8), m.character(L.coat));
    ha.add(lathe([[0.07, 0], [0.05, 0.14], [0.01, 0.3], [0, 0.31]], 8), m.character(L.marking), { p: [0, 0.0, 0.12], r: [Math.PI / 2 + 0.1, 0, 0], s: [1, 1, 0.6] });
    for (const x of [-0.09, 0.09]) eye(m, ha, [x, 0.05, 0.15], 0.035, L.accent);
    head.add(ha.build());
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.04, 0.12);
    const ja = m.figureKit(0.02);
    ja.add(lathe([[0.05, 0], [0.035, 0.12], [0, 0.24]], 8), m.character(L.marking), { r: [Math.PI / 2, 0, 0], s: [1, 1, 0.5] });
    jaw.add(ja.build());
    head.add(jaw);
    rig.add(head);
    const wings: THREE.Object3D[] = [];
    const feather: [number, number][] = [[0, 0.08], [0.1, 0.1], [0.14, -0.1], [0.12, -0.42], [0.06, -0.5], [0.04, -0.36], [0, -0.44], [-0.02, -0.2]];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.24, 0.62, 0.05);
      const wa = m.figureKit(0.025);
      wa.add(slab(feather, 0.05), m.character(new THREE.Color(L.coat).multiplyScalar(1.2).getHex()), { p: [side * 0.02, 0, 0], r: [-Math.PI / 2 + 0.3, side * 0.15, 0] });
      pivot.add(wa.build());
      rig.add(pivot);
      wings.push(pivot);
    }
    root.add(shadowDisc(0.45));
    root.userData.rig = { rig, head, wings, jaw, kind: 'raven', seed: 11 } satisfies Rig;
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
  const a = m.figureKit(0.03);
  const ha = m.figureKit(0.025);
  switch (kind) {
    case 'chicken': {
      const c = color ?? 0xf3ead8;
      a.add(lathe([[0, -0.3], [0.2, -0.2], [0.26, 0.0], [0.22, 0.18], [0.12, 0.26], [0, 0.28]], 10), m.character(c), { p: [0, 0.4, 0], r: [Math.PI / 2 - 0.25, 0, 0] });
      a.add(slab([[-0.12, 0], [0.12, 0], [0.16, 0.3], [0.04, 0.22], [0, 0.34], [-0.04, 0.22], [-0.16, 0.3]], 0.04), m.character(c), { p: [0, 0.42, -0.26], r: [-0.6, 0, 0] });
      for (const s of [-1, 1]) a.add(slab([[0, 0], [0.2, -0.04], [0.16, -0.14], [0, -0.1]], 0.03), m.character(new THREE.Color(c).multiplyScalar(0.85).getHex()), { p: [s * 0.2, 0.42, -0.05], r: [0, s > 0 ? -1.4 : 1.4, 0] }, { outline: false });
      for (const x of [-0.06, 0.06]) a.add(tube([[x, 0.2, 0], [x, 0.08, 0.02], [x, 0.0, 0.06]], 0.02, 4, 3), m.toon(P.gold), {}, { outline: false });
      head.position.set(0, 0.68, 0.2);
      ha.add(new THREE.SphereGeometry(0.12, 8, 6), m.character(c));
      ha.add(slab([[-0.06, 0], [0.06, 0], [0.05, 0.08], [0.02, 0.05], [0, 0.1], [-0.02, 0.05], [-0.05, 0.08]], 0.03), m.character(P.crimson), { p: [0, 0.1, 0], r: [0, Math.PI / 2, 0] }, { outline: false });
      ha.add(lathe([[0.035, 0], [0, 0.12]], 5), m.toon(P.gold), { p: [0, -0.01, 0.1], r: [Math.PI / 2, 0, 0] }, { outline: false });
      ha.add(new THREE.SphereGeometry(0.035, 6, 5), m.character(P.crimson), { p: [0, -0.08, 0.08] }, { outline: false });
      for (const x of [-1, 1]) ha.add(new THREE.SphereGeometry(0.018, 5, 4), m.toon(0x1a1014), { p: [x * 0.08, 0.03, 0.07] }, { outline: false });
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
      const tk = m.figureKit(0.02);
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

/** Pose any figure for this frame. Purely visual. */
export function animateFigure(root: THREE.Object3D, p: PoseInput): void {
  if (humanoidOf(root)) return animateHumanoid(root, p);
  const r = rigOf(root);
  if (!r) return;
  if (r.kind === 'person') return animatePerson(r, root, p);
  const t = p.t + r.seed;
  const rig = r.rig;
  const k = Math.min(1, (p.dt ?? 1 / 60) * 8);
  const w = Math.min(p.walk, 1.6);
  const joy = p.joy ?? 0;
  const action = p.action ?? 'none';
  const at = p.actionT ?? 0;

  if (r.kind === 'hound' || r.kind === 'animal') {
    const legs = r.legs ?? [];
    let bodyPitch = 0;
    let bodyY = (w > 0.05 ? Math.abs(Math.sin(t * 14)) * 0.08 : 0) + joy * Math.abs(Math.sin(t * 9)) * 0.45;
    const step = Math.sin(t * 14) * 0.6 * Math.min(1, w);
    const legT = legs.map((_, i) => (i < 2 ? step : -step));
    let headX = p.sniff ? 0.5 + Math.sin(t * 16) * 0.08 : w < 0.05 ? Math.sin(t * 0.7) * 0.08 : 0;
    let headZ = w < 0.05 && !p.sniff ? Math.sin(t * 0.5) * 0.25 : 0; // the curious head tilt
    let tailSpeed = joy > 0 ? 26 : w > 0.05 ? 12 : 5;
    let tailAmp = joy > 0 ? 0.8 : 0.45;
    let pant = joy > 0.1 || w > 1.1;
    if (r.kind === 'hound') {
      if (action === 'sit' && w < 0.05) {
        bodyPitch = -0.35;
        bodyY = -0.12;
        legT[1] = -1.3; // rear legs fold
        legT[3] = -1.3;
        legT[0] = 0.3;
        legT[2] = 0.3;
        tailAmp = 0.3;
      } else if (action === 'rest') {
        bodyY = -0.38;
        for (let i = 0; i < legT.length; i++) legT[i] = i % 2 ? -1.4 : -1.4;
        headX = 0.35;
        headZ = 0;
        tailAmp = 0.05;
        pant = false;
      } else if (action === 'eat') {
        headX = 0.75 + Math.abs(Math.sin(t * 9)) * 0.2;
        bodyPitch = 0.12;
        tailSpeed = 20;
        tailAmp = 0.7;
        pant = false;
      } else if (action === 'bond') {
        // Play bow, then a happy bounce.
        const bow = at < 0.5;
        bodyPitch = bow ? 0.35 : 0;
        legT[0] = bow ? -0.9 : legT[0]!;
        legT[2] = bow ? -0.9 : legT[2]!;
        bodyY = bow ? -0.1 : Math.abs(Math.sin(t * 10)) * 0.4;
        tailSpeed = 30;
        tailAmp = 0.9;
        pant = true;
      }
      if (r.bowl) r.bowl.visible = action === 'eat';
      if (r.tongue) r.tongue.visible = pant;
      ease(r.jaw, 'x', pant ? 0.35 + Math.sin(t * 12) * 0.08 : 0, k * 2);
      for (const [i, ear] of (r.ears ?? []).entries()) {
        const s = i ? 1 : -1;
        ear.rotation.z = s * (0.35 + (w > 0.05 ? Math.sin(t * 14 + i) * 0.25 : Math.max(0, Math.sin(t * 0.9 + i * 2) - 0.9) * 3));
        ear.rotation.x = w > 1 ? -0.4 : 0;
      }
    }
    rig.position.y += (bodyY - rig.position.y) * k * 2;
    ease(rig, 'x', bodyPitch, k);
    rig.rotation.y = joy > 0.3 && action !== 'bond' ? t * 7 * joy : 0;
    legs.forEach((leg, i) => ease(leg, 'x', legT[i]!, action === 'none' ? 0.6 : k));
    if (r.tail) r.tail.rotation.y = Math.sin(t * tailSpeed) * tailAmp;
    ease(r.head, 'x', headX, k * 1.5);
    ease(r.head, 'z', headZ, k);
    return;
  }
  if (r.kind === 'moth') {
    const flap = action === 'rest' ? 0.2 + Math.abs(Math.sin(t * 3)) * 0.2 : 0.3 + Math.abs(Math.sin(t * (joy > 0 ? 26 : 18))) * 0.9;
    for (const [i, wing] of (r.wings ?? []).entries()) wing.rotation.y = (i ? -1 : 1) * flap;
    const dip = action === 'eat' ? -0.6 + Math.sin(t * 6) * 0.1 : action === 'rest' ? -0.3 : 0;
    rig.position.y = 1.6 + Math.sin(t * 2) * 0.25 + joy * 0.6 + dip;
    rig.rotation.y = joy > 0.2 || action === 'bond' ? t * 6 : Math.sin(t * 0.8) * 0.4;
    rig.rotation.z = action === 'bond' ? Math.sin(t * 6) * 0.6 : 0;
    const halo = rig.getObjectByName('moth-halo');
    if (halo) halo.scale.setScalar(1 + joy * 0.8 + (action === 'eat' ? 0.5 + Math.sin(t * 8) * 0.2 : 0));
    return;
  }
  if (r.kind === 'raven') {
    const hop = w > 0.05 ? Math.abs(Math.sin(t * 10)) * 0.18 : joy * Math.abs(Math.sin(t * 8)) * 0.4;
    rig.position.y = hop + (action === 'bond' ? Math.abs(Math.sin(t * 9)) * 0.3 : 0);
    // A wing stretch every few seconds, flapping when pleased or hurrying.
    const stretch = Math.max(0, Math.sin(t * 0.8) - 0.85) * 6;
    for (const [i, wing] of (r.wings ?? []).entries()) {
      const flap = joy > 0.1 || w > 1 || action === 'bond' ? 0.4 + Math.sin(t * 20) * 0.6 : 0.1 + (i === 0 ? stretch : 0);
      wing.rotation.z = (i ? -1 : 1) * flap;
    }
    const caw = Math.max(0, Math.sin(t * 0.6 + 1) - 0.92) * 8;
    ease(r.jaw, 'x', caw * 0.5 + (action === 'eat' ? 0.2 : 0), k * 3);
    ease(r.head, 'y', Math.sin(t * 1.7) * 0.5, k);
    ease(r.head, 'z', Math.sin(t * 0.9) * 0.35, k);
    ease(r.head, 'x', action === 'eat' ? 0.6 + Math.abs(Math.sin(t * 10)) * 0.4 : action === 'rest' ? 0.3 : 0, k * 2);
    rig.scale.setScalar(action === 'rest' ? 1.08 : 1);
  }
}
