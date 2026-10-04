import type { PropSpec, Rect, SceneLayout, Vec2 } from '../render/layout';

/**
 * Pure presentation-side geometry: which zone the player stands in, what they
 * bump into, which exit or interactable is near. No simulation state changes
 * here — callers turn results into intents.
 */
export const PLAYER_RADIUS = 0.5;

export const inRect = ([x, z]: Vec2, [x0, z0, x1, z1]: Rect): boolean => x >= x0 && x <= x1 && z >= z0 && z <= z1;

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The simulation location whose zone contains this point, if any. First match wins. */
export function zoneAt(layout: SceneLayout, p: Vec2): string | undefined {
  return layout.zones.find((z) => inRect(p, z.rect))?.locationId;
}

/** Default footprint (w, d) of solid props. Decorative ones return undefined. */
export function footprint(prop: PropSpec): [number, number] | undefined {
  if (prop.size) {
    if (prop.type === 'field' || prop.type === 'fence') return prop.type === 'fence' ? [prop.size[0], 0.4] : undefined;
    return [prop.size[0], prop.size[1]];
  }
  switch (prop.type) {
    case 'well': return [2.4, 2.4];
    case 'stall': return [3.6, 2.4];
    case 'tree': case 'orchard': return [1.2, 1.2];
    case 'rock': return [1.6, 1.4];
    case 'crate': case 'barrel': return [1, 1];
    case 'table': return [2, 1.4];
    case 'hearth': return [1.4, 2.6];
    case 'board': case 'signpost': case 'lamp': return [0.4, 0.4];
    case 'scarecrow': case 'shrine': case 'memorial': return [0.8, 0.8];
    case 'haystack': return [2, 2];
    case 'cart': return [3, 1.6];
    case 'bed': return [2, 3];
    case 'chest': return [1.2, 0.8];
    case 'bench': return [2, 0.6];
    case 'shelf': return [2.2, 0.6];
    case 'boat': return [3.2, 1.4];
    default: return undefined;
  }
}

function blocked(layout: SceneLayout, p: Vec2): boolean {
  const [hw, hd] = [layout.size[0] / 2, layout.size[1] / 2];
  if (Math.abs(p[0]) > hw - PLAYER_RADIUS || Math.abs(p[1]) > hd - PLAYER_RADIUS) return true;
  for (const w of layout.water ?? []) if (p[0] > w[0] - PLAYER_RADIUS && p[0] < w[2] + PLAYER_RADIUS && p[1] > w[1] - PLAYER_RADIUS && p[1] < w[3] + PLAYER_RADIUS) return true;
  for (const prop of layout.props) {
    const fp = footprint(prop);
    if (!fp) continue;
    const [w, d] = fp;
    if (Math.abs(p[0] - prop.at[0]) < w / 2 + PLAYER_RADIUS && Math.abs(p[1] - prop.at[1]) < d / 2 + PLAYER_RADIUS) return true;
  }
  return false;
}

/** Move from `from` by `delta`, sliding along obstacles axis by axis. */
export function moveWithCollision(layout: SceneLayout, from: Vec2, delta: Vec2): Vec2 {
  let p: Vec2 = [from[0], from[1]];
  const tryX: Vec2 = [p[0] + delta[0], p[1]];
  if (!blocked(layout, tryX)) p = tryX;
  const tryZ: Vec2 = [p[0], p[1] + delta[1]];
  if (!blocked(layout, tryZ)) p = tryZ;
  return p;
}

export function isBlocked(layout: SceneLayout, p: Vec2): boolean {
  return blocked(layout, p);
}

export interface Nearest<T> {
  item: T;
  distance: number;
}

export function nearest<T>(items: Iterable<T>, pos: Vec2, at: (t: T) => Vec2, within: number): Nearest<T> | undefined {
  let best: Nearest<T> | undefined;
  for (const item of items) {
    const d = dist(pos, at(item));
    if (d <= within && (!best || d < best.distance)) best = { item, distance: d };
  }
  return best;
}
