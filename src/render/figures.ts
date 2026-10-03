import * as THREE from 'three';
import type { Materials } from './materials';

export interface FigureStyle {
  body: number;
  accent: number;
  skin?: number;
  height?: number;
}

/**
 * A stylized placeholder character: strong silhouette, two flat colours,
 * an outline. Original design; no external assets.
 */
export function createFigure(m: Materials, style: FigureStyle): THREE.Group {
  const g = new THREE.Group();
  const h = style.height ?? 2.2;
  const body = m.mesh(new THREE.CylinderGeometry(0.32, 0.5, h * 0.62, 8), style.body);
  body.position.y = h * 0.31;
  g.add(body);
  const head = m.mesh(new THREE.SphereGeometry(h * 0.15, 12, 10), style.skin ?? 0xe7c39a);
  head.position.y = h * 0.62 + h * 0.13;
  g.add(head);
  const hood = m.mesh(new THREE.ConeGeometry(h * 0.19, h * 0.25, 8), style.accent);
  hood.position.y = h * 0.62 + h * 0.3;
  g.add(hood);
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 16), m.toon(style.accent));
  sash.rotation.x = Math.PI / 2;
  sash.position.y = h * 0.36;
  g.add(sash);
  return g;
}

/** Colour styles per NPC tag; keeps characters readable at a distance. */
export function styleFor(m: Materials, tags: string[], isPlayer = false): FigureStyle {
  const P = m.palette;
  if (isPlayer) return { body: P.light, accent: P.ember };
  if (tags.includes('innkeeper')) return { body: P.crimson, accent: P.gold };
  if (tags.includes('merchant')) return { body: P.gold, accent: P.timber };
  if (tags.includes('farmer')) return { body: P.moss, accent: P.gold };
  if (tags.includes('courier')) return { body: P.ember, accent: P.ink };
  if (tags.includes('official')) return { body: P.ink, accent: P.crimson };
  if (tags.includes('traveler')) return { body: P.stone, accent: P.moss };
  return { body: P.stone, accent: P.light };
}

/** Original placeholder Familiar figures: a hound, a glowing moth, a raven. */
export function createFamiliarFigure(m: Materials, figure: string): THREE.Group {
  const P = m.palette;
  const g = new THREE.Group();
  if (figure === 'hound') {
    const body = m.mesh(new THREE.BoxGeometry(0.5, 0.45, 1), P.ember);
    body.position.y = 0.5;
    g.add(body);
    const head = m.mesh(new THREE.BoxGeometry(0.42, 0.4, 0.42), P.ember);
    head.position.set(0, 0.82, 0.55);
    g.add(head);
    const snout = m.mesh(new THREE.BoxGeometry(0.22, 0.18, 0.25), P.light, false);
    snout.position.set(0, 0.74, 0.82);
    g.add(snout);
    for (const x of [-0.16, 0.16]) {
      const ear = m.mesh(new THREE.ConeGeometry(0.1, 0.25, 4), P.timber, false);
      ear.position.set(x, 1.07, 0.5);
      g.add(ear);
    }
    for (const [x, z] of [[-0.17, 0.35], [0.17, 0.35], [-0.17, -0.35], [0.17, -0.35]] as const) {
      const leg = m.mesh(new THREE.BoxGeometry(0.13, 0.32, 0.13), P.timber, false);
      leg.position.set(x, 0.16, z);
      g.add(leg);
    }
    const tail = m.mesh(new THREE.BoxGeometry(0.08, 0.08, 0.4), P.ember, false);
    tail.position.set(0, 0.7, -0.62);
    tail.rotation.x = -0.6;
    g.add(tail);
  } else if (figure === 'moth') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: P.light }));
    g.add(body);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), new THREE.MeshBasicMaterial({ color: P.gold, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      wing.position.x = side * 0.28;
      wing.rotation.y = side * 0.5;
      g.add(wing);
    }
    g.add(new THREE.PointLight(P.gold, 3, 5, 1.8));
    g.position.y = 1.6;
  } else {
    const body = m.mesh(new THREE.ConeGeometry(0.28, 0.8, 6), P.ink);
    body.rotation.x = Math.PI / 2.4;
    body.position.y = 0.45;
    g.add(body);
    const head = m.mesh(new THREE.SphereGeometry(0.18, 8, 6), P.ink);
    head.position.set(0, 0.75, 0.25);
    g.add(head);
    const beak = m.mesh(new THREE.ConeGeometry(0.06, 0.22, 4), P.stone, false);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.73, 0.45);
    g.add(beak);
  }
  return g;
}
