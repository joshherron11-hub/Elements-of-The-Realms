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
