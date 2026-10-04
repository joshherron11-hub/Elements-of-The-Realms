import * as THREE from 'three';
import type { Materials } from './materials';
import { softDisc } from './textures';

/**
 * Stylized characters and Familiars for Chromatic Mythic. Original designs, no
 * external assets: chunky proportions, a big readable head, a role-specific hat
 * or garment for the silhouette, rim-lit cel materials and an ink outline.
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

const SKIN = [0xe7c39a, 0xc99a6e, 0x9c6b48, 0xf0d2b0];

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

/** Limb with its pivot at the top, so rotation.x swings it. */
function limb(m: Materials, len: number, radius: number, color: number, at: [number, number, number]): THREE.Group {
  const pivot = new THREE.Group();
  const part = m.part(new THREE.CapsuleGeometry(radius, len, 3, 8), color, true, 0.035);
  part.position.y = -len / 2 - radius * 0.5;
  pivot.add(part);
  pivot.position.set(...at);
  return pivot;
}

/** A person. Height ~2.5 m in world units: big enough to read on a phone. */
export function createFigure(m: Materials, style: FigureStyle): THREE.Group {
  const P = m.palette;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const h = style.height ?? 2.5;
  const k = h / 2.5;
  const role = style.role ?? 'villager';
  const skin = style.skin ?? SKIN[(style.body + style.accent) % SKIN.length]!;
  const dark = P.ink;
  const robe = role === 'official';

  const legLen = 0.62 * k;
  const hip = 0.95 * k;
  const legL = limb(m, legLen, 0.13 * k, robe ? style.body : P.timber, [-0.17 * k, hip, 0]);
  const legR = limb(m, legLen, 0.13 * k, robe ? style.body : P.timber, [0.17 * k, hip, 0]);
  for (const leg of [legL, legR]) {
    const boot = m.mesh(new THREE.BoxGeometry(0.24 * k, 0.16 * k, 0.36 * k), dark, false);
    boot.position.set(0, -legLen - 0.2 * k, 0.06 * k);
    leg.add(boot);
  }
  rig.add(legL, legR);

  // Torso: a tapered tunic (a long robe for officials) — the main colour block.
  const torsoH = (robe ? 1.25 : 0.85) * k;
  const torso = m.part(new THREE.CylinderGeometry(0.34 * k, (robe ? 0.56 : 0.46) * k, torsoH, 10), style.body, true, 0.06);
  torso.position.y = hip + torsoH / 2 - (robe ? 0.42 * k : 0);
  rig.add(torso);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.4 * k, 0.05 * k, 6, 18), m.character(style.accent));
  belt.rotation.x = Math.PI / 2;
  belt.position.y = hip + 0.12 * k;
  rig.add(belt);

  const shoulder = hip + 0.78 * k;
  const armL = limb(m, 0.55 * k, 0.1 * k, style.body, [-0.42 * k, shoulder, 0]);
  const armR = limb(m, 0.55 * k, 0.1 * k, style.body, [0.42 * k, shoulder, 0]);
  for (const arm of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11 * k, 8, 6), m.character(skin));
    hand.position.y = -0.8 * k;
    arm.add(hand);
  }
  armL.rotation.z = -0.12;
  armR.rotation.z = 0.12;
  rig.add(armL, armR);

  // Head: oversized for readability.
  const headY = shoulder + 0.38 * k;
  const head = new THREE.Group();
  head.position.y = headY;
  const skull = m.part(new THREE.SphereGeometry(0.33 * k, 14, 12), skin, true, 0.05);
  head.add(skull);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045 * k, 6, 5), new THREE.MeshBasicMaterial({ color: dark }));
    eye.position.set(side * 0.12 * k, 0.03 * k, 0.29 * k);
    head.add(eye);
  }
  rig.add(head);

  // Role silhouette: the one shape you recognise from across the square.
  const add = (o: THREE.Object3D, parent: THREE.Object3D = head) => parent.add(o);
  switch (role) {
    case 'player': {
      const hood = m.part(new THREE.ConeGeometry(0.42 * k, 0.62 * k, 10), style.accent, true, 0.05);
      hood.position.y = 0.3 * k;
      hood.rotation.x = -0.18;
      add(hood);
      const cape = m.part(new THREE.CylinderGeometry(0.36 * k, 0.62 * k, 1.2 * k, 10, 1, true, Math.PI * 0.6, Math.PI * 0.8), style.accent, false);
      cape.position.set(0, hip + 0.35 * k, -0.06 * k);
      cape.rotation.y = Math.PI;
      rig.add(cape);
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3 * k, 0.09 * k, 6, 14), m.character(P.gold));
      scarf.rotation.x = Math.PI / 2;
      scarf.position.y = shoulder + 0.08 * k;
      rig.add(scarf);
      break;
    }
    case 'innkeeper': {
      const scarf = m.part(new THREE.SphereGeometry(0.35 * k, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), style.accent, true, 0.04);
      scarf.position.y = 0.06 * k;
      add(scarf);
      const apron = new THREE.Mesh(new THREE.PlaneGeometry(0.62 * k, 0.9 * k), m.character(P.light));
      apron.position.set(0, hip + 0.18 * k, 0.47 * k);
      apron.rotation.x = -0.18;
      rig.add(apron);
      break;
    }
    case 'merchant': {
      const brim = m.part(new THREE.CylinderGeometry(0.62 * k, 0.62 * k, 0.06 * k, 14), style.accent, true, 0.04);
      brim.position.y = 0.28 * k;
      add(brim);
      const crown = m.part(new THREE.CylinderGeometry(0.26 * k, 0.32 * k, 0.32 * k, 10), style.accent, false);
      crown.position.y = 0.45 * k;
      add(crown);
      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.05 * k, 0.5 * k, 4), m.character(P.crimson));
      feather.position.set(0.24 * k, 0.6 * k, -0.05 * k);
      feather.rotation.z = -0.6;
      add(feather);
      const pack = m.part(new THREE.BoxGeometry(0.5 * k, 0.6 * k, 0.3 * k), P.timber);
      pack.position.set(0, shoulder - 0.3 * k, -0.45 * k);
      rig.add(pack);
      break;
    }
    case 'farmer': {
      const straw = m.part(new THREE.ConeGeometry(0.55 * k, 0.3 * k, 12), P.gold, true, 0.04);
      straw.position.y = 0.34 * k;
      add(straw);
      const scythe = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * k, 0.03 * k, 1.6 * k, 5), m.toon(P.timber));
      shaft.position.y = -0.3 * k;
      scythe.add(shaft);
      armR.add(scythe);
      break;
    }
    case 'courier': {
      const cap = m.part(new THREE.SphereGeometry(0.35 * k, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), style.accent, true, 0.04);
      cap.position.y = 0.08 * k;
      add(cap);
      const peak = new THREE.Mesh(new THREE.BoxGeometry(0.42 * k, 0.04 * k, 0.24 * k), m.character(style.accent));
      peak.position.set(0, 0.14 * k, 0.32 * k);
      add(peak);
      const bag = m.part(new THREE.BoxGeometry(0.42 * k, 0.36 * k, 0.16 * k), P.timber);
      bag.position.set(0.42 * k, hip + 0.05 * k, 0.12 * k);
      rig.add(bag);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.46 * k, 0.03 * k, 4, 18), m.character(P.timber));
      strap.position.y = hip + 0.5 * k;
      strap.rotation.set(0.1, 0, 0.75);
      rig.add(strap);
      break;
    }
    case 'official': {
      const hat = m.part(new THREE.CylinderGeometry(0.26 * k, 0.3 * k, 0.6 * k, 10), dark, true, 0.04);
      hat.position.y = 0.48 * k;
      add(hat);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.29 * k, 0.04 * k, 4, 14), m.character(style.accent));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.25 * k;
      add(band);
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.3 * k, 0.035 * k, 4, 16), m.glow(P.gold, 1.2));
      chain.rotation.x = Math.PI / 2.6;
      chain.position.set(0, shoulder - 0.08 * k, 0.12 * k);
      rig.add(chain);
      break;
    }
    case 'traveler': {
      const hood = m.part(new THREE.ConeGeometry(0.44 * k, 0.7 * k, 10), style.accent, true, 0.05);
      hood.position.y = 0.32 * k;
      add(hood);
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * k, 0.04 * k, 2.4 * k, 5), m.toon(P.timber));
      staff.position.set(0.55 * k, 1.2 * k, 0.2 * k);
      rig.add(staff);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1 * k), m.glow(P.gold, 2.4));
      gem.position.set(0.55 * k, 2.45 * k, 0.2 * k);
      rig.add(gem);
      break;
    }
    case 'patron':
    case 'villager': {
      const cap = m.part(new THREE.SphereGeometry(0.34 * k, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), style.accent, true, 0.04);
      cap.position.y = 0.08 * k;
      add(cap);
      break;
    }
  }

  root.add(shadowDisc(0.75 * k));
  root.userData.rig = { rig, head, armL, armR, legL, legR, kind: 'person', seed: (style.body % 97) + (style.accent % 13) } satisfies Rig;
  return root;
}

/** Colour styles per NPC tag; keeps characters readable at a distance. */
export function styleFor(m: Materials, tags: string[], isPlayer = false): FigureStyle {
  const P = m.palette;
  if (isPlayer) return { body: P.light, accent: P.ember, role: 'player', height: 2.55 };
  if (tags.includes('innkeeper')) return { body: P.crimson, accent: P.gold, role: 'innkeeper' };
  if (tags.includes('merchant')) return { body: P.gold, accent: P.timber, role: 'merchant' };
  if (tags.includes('farmer')) return { body: P.moss, accent: P.gold, role: 'farmer' };
  if (tags.includes('courier')) return { body: P.ember, accent: P.ink, role: 'courier' };
  if (tags.includes('official')) return { body: P.ink, accent: P.crimson, role: 'official' };
  if (tags.includes('traveler')) return { body: P.stone, accent: P.moss, role: 'traveler' };
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

/** Original placeholder Familiar figures: a hound, a glowing moth, a raven. */
export function createFamiliarFigure(m: Materials, figure: string): THREE.Group {
  const P = m.palette;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  if (figure === 'hound') {
    const body = m.part(new THREE.CapsuleGeometry(0.3, 0.5, 4, 10), P.ember, true, 0.05);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.62;
    rig.add(body);
    const chest = m.part(new THREE.SphereGeometry(0.26, 10, 8), P.light, false);
    chest.position.set(0, 0.6, 0.38);
    rig.add(chest);
    const head = new THREE.Group();
    head.position.set(0, 0.98, 0.58);
    const skull = m.part(new THREE.SphereGeometry(0.28, 12, 10), P.ember, true, 0.05);
    head.add(skull);
    const snout = m.part(new THREE.BoxGeometry(0.2, 0.17, 0.28), P.light, false);
    snout.position.set(0, -0.07, 0.27);
    head.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: P.ink }));
    nose.position.set(0, -0.02, 0.42);
    head.add(nose);
    for (const x of [-0.2, 0.2]) {
      const ear = m.part(new THREE.ConeGeometry(0.11, 0.34, 4), P.timber, false);
      ear.position.set(x, 0.18, -0.04);
      ear.rotation.z = x > 0 ? -0.5 : 0.5;
      head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), new THREE.MeshBasicMaterial({ color: P.ink }));
      eye.position.set(x * 0.5, 0.06, 0.24);
      head.add(eye);
    }
    rig.add(head);
    const legs: THREE.Group[] = [];
    for (const [x, z] of [[-0.17, 0.32], [0.17, -0.32], [0.17, 0.32], [-0.17, -0.32]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.42, z);
      const leg = m.part(new THREE.CapsuleGeometry(0.07, 0.26, 2, 6), P.timber, false);
      leg.position.y = -0.22;
      pivot.add(leg);
      rig.add(pivot);
      legs.push(pivot);
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.78, -0.5);
    const tailMesh = m.part(new THREE.ConeGeometry(0.07, 0.5, 5), P.ember, false);
    tailMesh.rotation.x = -2.2;
    tailMesh.position.set(0, 0.12, -0.15);
    tail.add(tailMesh);
    rig.add(tail);
    root.add(shadowDisc(0.7));
    root.userData.rig = { rig, head, tail, legs, kind: 'hound', seed: 3 } satisfies Rig;
  } else if (figure === 'moth') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.22, 3, 8), m.glow(P.light, 1.6));
    body.rotation.x = Math.PI / 2;
    rig.add(body);
    const wings: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.34, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(P.gold).multiplyScalar(1.6), transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false }));
      wing.position.x = side * 0.32;
      pivot.add(wing);
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
    const body = m.part(new THREE.SphereGeometry(0.32, 10, 8), P.ink, true, 0.05);
    body.scale.set(0.9, 0.85, 1.3);
    body.position.y = 0.5;
    rig.add(body);
    const head = new THREE.Group();
    head.position.set(0, 0.86, 0.3);
    head.add(m.part(new THREE.SphereGeometry(0.2, 10, 8), P.ink, true, 0.04));
    const beak = m.part(new THREE.ConeGeometry(0.07, 0.3, 5), P.gold, false);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.03, 0.26);
    head.add(beak);
    for (const x of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), m.glow(P.gold, 1.8));
      eye.position.set(x, 0.05, 0.16);
      head.add(eye);
    }
    rig.add(head);
    const wings: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.26, 0.62, 0);
      const wing = m.part(new THREE.BoxGeometry(0.08, 0.36, 0.62), P.stone, false);
      wing.position.set(side * 0.04, -0.12, -0.05);
      pivot.add(wing);
      rig.add(pivot);
      wings.push(pivot);
    }
    const tail = m.part(new THREE.BoxGeometry(0.22, 0.05, 0.4), P.ink, false);
    tail.position.set(0, 0.42, -0.45);
    tail.rotation.x = 0.4;
    rig.add(tail);
    for (const x of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.24, 4), m.toon(P.gold));
      leg.position.set(x, 0.12, 0.02);
      rig.add(leg);
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
  let head: THREE.Group;
  let tail: THREE.Object3D | undefined;
  switch (kind) {
    case 'chicken': {
      const body = m.part(new THREE.SphereGeometry(0.28, 10, 8), color ?? P.light, true, 0.04);
      body.position.y = 0.36;
      body.scale.set(0.9, 0.9, 1.15);
      rig.add(body);
      head = new THREE.Group();
      head.position.set(0, 0.66, 0.2);
      head.add(m.part(new THREE.SphereGeometry(0.14, 8, 6), color ?? P.light, true, 0.03));
      const comb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.14), m.character(P.crimson));
      comb.position.y = 0.14;
      head.add(comb);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), m.character(P.gold));
      beak.rotation.x = Math.PI / 2;
      beak.position.z = 0.15;
      head.add(beak);
      rig.add(head);
      tail = m.part(new THREE.ConeGeometry(0.12, 0.26, 5), color ?? P.light, false);
      tail.position.set(0, 0.5, -0.28);
      tail.rotation.x = -0.9;
      rig.add(tail);
      root.add(shadowDisc(0.35));
      break;
    }
    case 'sheep': {
      const body = m.part(new THREE.SphereGeometry(0.55, 10, 8), color ?? 0xf3ead8, true, 0.05);
      body.scale.set(0.95, 0.85, 1.25);
      body.position.y = 0.75;
      rig.add(body);
      head = new THREE.Group();
      head.position.set(0, 0.9, 0.68);
      head.add(m.part(new THREE.BoxGeometry(0.3, 0.34, 0.38), P.ink, true, 0.03));
      rig.add(head);
      for (const [x, z] of [[-0.25, 0.35], [0.25, 0.35], [-0.25, -0.35], [0.25, -0.35]] as const) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 5), m.character(P.ink));
        leg.position.set(x, 0.2, z);
        rig.add(leg);
      }
      root.add(shadowDisc(0.8));
      break;
    }
    case 'crow': {
      const body = m.part(new THREE.SphereGeometry(0.2, 8, 6), color ?? P.ink, true, 0.04);
      body.scale.set(0.9, 0.85, 1.4);
      body.position.y = 0.25;
      rig.add(body);
      head = new THREE.Group();
      head.position.set(0, 0.44, 0.18);
      head.add(m.part(new THREE.SphereGeometry(0.12, 8, 6), color ?? P.ink, false));
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), m.character(P.stone));
      beak.rotation.x = Math.PI / 2;
      beak.position.z = 0.14;
      head.add(beak);
      rig.add(head);
      root.add(shadowDisc(0.25));
      break;
    }
    case 'cat': {
      const c = color ?? P.ember;
      const body = m.part(new THREE.CapsuleGeometry(0.17, 0.42, 3, 8), c, true, 0.04);
      body.rotation.x = Math.PI / 2;
      body.position.y = 0.32;
      rig.add(body);
      head = new THREE.Group();
      head.position.set(0, 0.52, 0.36);
      head.add(m.part(new THREE.SphereGeometry(0.17, 10, 8), c, true, 0.03));
      for (const x of [-0.09, 0.09]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), m.character(c));
        ear.position.set(x, 0.15, 0);
        head.add(ear);
      }
      rig.add(head);
      const t = new THREE.Group();
      t.position.set(0, 0.36, -0.36);
      const tm = m.part(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 5), c, false);
      tm.position.set(0, 0.22, -0.05);
      tm.rotation.x = -0.35;
      t.add(tm);
      rig.add(t);
      tail = t;
      root.add(shadowDisc(0.4));
      break;
    }
  }
  root.userData.rig = { rig, head: head!, tail, kind: 'animal', seed: Math.floor((color ?? 5) % 17) } satisfies Rig;
  return root;
}
