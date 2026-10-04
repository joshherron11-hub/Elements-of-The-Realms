import { err, ok, type Result } from '../core/result';
import { Validator } from '../core/schema';

/**
 * SCENE LAYOUTS — presentation data.
 *
 * A layout says where things stand in one walkable section. It never decides
 * gameplay: zones map ground areas to simulation locations, exits trigger
 * travel intents, and spots say where to draw actors and resource nodes.
 * The world is continuous in history, not necessarily in geometry — several
 * locations can share a section, and sections connect through exits.
 *
 * Coordinates: x to the right, z towards the camera, metres.
 */
export type Vec2 = [number, number];
export type Rect = [number, number, number, number]; // x0, z0, x1, z1

export const PROP_TYPES = [
  'building', 'stall', 'well', 'board', 'lamp', 'crate', 'barrel', 'wall', 'gatehouse', 'keep', 'fence',
  'tree', 'orchard', 'deadwood', 'field', 'rock', 'signpost', 'counter', 'hearth', 'table',
  'scarecrow', 'haystack', 'cart', 'bed', 'chest', 'bench', 'shrine', 'memorial', 'boat', 'flowers', 'banner', 'rug', 'shelf', 'pen',
  'sack', 'bunting', 'woodpile', 'pumpkins', 'bush', 'lantern', 'planter',
] as const;
export type PropType = (typeof PROP_TYPES)[number];

export interface PropSpec {
  type: PropType;
  at: Vec2;
  size?: [number, number, number]; // width (x), depth (z), height
  color?: string; // palette key
  roof?: string; // palette key
  label?: string;
}

export interface ExitSpec {
  id: string;
  at: Vec2;
  radius: number;
  label: string;
  to: { scene: string; locationId: string; at: Vec2 };
}

/** Something a player can read with E. `dynamic` text is composed from world state. */
export interface ReadableSpec {
  id: string;
  at: Vec2;
  title: string;
  text?: string;
  dynamic?: 'notice-board' | 'tavern-news' | 'market-prices' | 'deed';
  /** For `deed`: which property. */
  propertyId?: string;
}

/** Presentation-only life: walkers, patrons, animals. Never simulation state. */
export interface ExtraSpec {
  kind: 'villager' | 'patron' | 'chicken' | 'sheep' | 'crow' | 'cat';
  /** Stand here (with a little idle drift)… */
  at?: Vec2;
  /** …or walk this loop. */
  path?: Vec2[];
  /** Only present during these in-game hours [from, to). */
  hours?: [number, number];
  color?: string;
}

export interface AmbientSpec {
  /** Number of drifting autumn leaves. */
  leaves: number;
  /** Chimney smoke sources: [x, z, height]. */
  smoke: [number, number, number][];
  /** Fireflies at night. */
  fireflies: boolean;
}

export interface SceneLayout {
  id: string;
  name: string;
  size: Vec2;
  ground: string;
  interior: boolean;
  backdrops: { kind: 'hills' | 'treeline'; distance: number; height: number; color: string }[];
  zones: { locationId: string; rect: Rect }[];
  spawns: Record<string, Vec2>;
  playerStart: Vec2;
  exits: ExitSpec[];
  npcs: Record<string, Vec2>;
  nodes: Record<string, Vec2>;
  /** Walkways. `surface` picks the painted texture (cobbles in town, packed earth on roads). */
  paths: { rect: Rect; color: string; surface?: 'cobble' | 'dirt' | 'plain' }[];
  props: PropSpec[];
  /** LocationId → named activity spots NPC routines can use. */
  spots: Record<string, Record<string, Vec2>>;
  readables: ReadableSpec[];
  extras: ExtraSpec[];
  /** Still water: drawn, and impassable. */
  water: Rect[];
  ambient: AmbientSpec;
  /** PropertyId → where its owner tends it (market stalls). */
  stalls: Record<string, Vec2>;
}

export function parseSceneLayout(raw: unknown, source = 'scene'): Result<SceneLayout> {
  const v = new Validator(source);
  const o = v.obj(raw, '');
  v.noExtraKeys(o, ['id', 'name', 'size', 'ground', 'interior', 'backdrops', 'zones', 'spawns', 'playerStart', 'exits', 'npcs', 'nodes', 'paths', 'props', 'spots', 'readables', 'extras', 'water', 'ambient', 'stalls'], '');
  const vec = (x: unknown, p: string): Vec2 => {
    const a = v.arr(x, p, (n, np) => v.num(n, np));
    if (a.length !== 2) v.fail(p, 'expected [x, z]');
    return [a[0] ?? 0, a[1] ?? 0];
  };
  const rect = (x: unknown, p: string): Rect => {
    const a = v.arr(x, p, (n, np) => v.num(n, np));
    if (a.length !== 4 || a[0]! >= a[2]! || a[1]! >= a[3]!) v.fail(p, 'expected [x0, z0, x1, z1] with x0 < x1 and z0 < z1');
    return [a[0] ?? 0, a[1] ?? 0, a[2] ?? 1, a[3] ?? 1];
  };
  const vecMap = (x: unknown, p: string): Record<string, Vec2> =>
    Object.fromEntries(Object.entries(v.obj(x ?? {}, p)).map(([k, val]) => [k, vec(val, `${p}.${k}`)]));

  const layout: SceneLayout = {
    id: v.str(o.id, 'id'),
    name: v.str(o.name, 'name'),
    size: vec(o.size, 'size'),
    ground: v.str(o.ground, 'ground'),
    interior: o.interior === undefined ? false : v.bool(o.interior, 'interior'),
    backdrops: v.arr(o.backdrops ?? [], 'backdrops', (x, p) => {
      const b = v.obj(x, p);
      return { kind: v.oneOf(b.kind, ['hills', 'treeline'] as const, `${p}.kind`), distance: v.num(b.distance, `${p}.distance`, 1), height: v.num(b.height, `${p}.height`, 0), color: v.str(b.color, `${p}.color`) };
    }),
    zones: v.arr(o.zones, 'zones', (x, p) => {
      const z = v.obj(x, p);
      return { locationId: v.str(z.locationId, `${p}.locationId`), rect: rect(z.rect, `${p}.rect`) };
    }),
    spawns: vecMap(o.spawns, 'spawns'),
    playerStart: vec(o.playerStart, 'playerStart'),
    exits: v.arr(o.exits ?? [], 'exits', (x, p) => {
      const e = v.obj(x, p);
      const t = v.obj(e.to, `${p}.to`);
      return {
        id: v.str(e.id, `${p}.id`),
        at: vec(e.at, `${p}.at`),
        radius: v.num(e.radius, `${p}.radius`, 0.1),
        label: v.str(e.label, `${p}.label`),
        to: { scene: v.str(t.scene, `${p}.to.scene`), locationId: v.str(t.locationId, `${p}.to.locationId`), at: vec(t.at, `${p}.to.at`) },
      };
    }),
    npcs: vecMap(o.npcs, 'npcs'),
    nodes: vecMap(o.nodes, 'nodes'),
    paths: v.arr(o.paths ?? [], 'paths', (x, p) => {
      const pa = v.obj(x, p);
      const path: SceneLayout['paths'][number] = { rect: rect(pa.rect, `${p}.rect`), color: v.str(pa.color, `${p}.color`) };
      if (pa.surface !== undefined) path.surface = v.oneOf(pa.surface, ['cobble', 'dirt', 'plain'] as const, `${p}.surface`);
      return path;
    }),
    props: v.arr(o.props ?? [], 'props', (x, p) => {
      const pr = v.obj(x, p);
      v.noExtraKeys(pr, ['type', 'at', 'size', 'color', 'roof', 'label'], p);
      const size = pr.size === undefined ? undefined : v.arr(pr.size, `${p}.size`, (n, np) => v.num(n, np, 0));
      if (size && size.length !== 3) v.fail(`${p}.size`, 'expected [width, depth, height]');
      return {
        type: v.oneOf(pr.type, PROP_TYPES, `${p}.type`),
        at: vec(pr.at, `${p}.at`),
        size: size as [number, number, number] | undefined,
        color: v.optStr(pr.color, `${p}.color`),
        roof: v.optStr(pr.roof, `${p}.roof`),
        label: v.optStr(pr.label, `${p}.label`),
      };
    }),
    spots: {},
    readables: [],
    extras: [],
    water: [],
    ambient: { leaves: 0, smoke: [], fireflies: false },
    stalls: {},
  };
  layout.spots = Object.fromEntries(Object.entries(v.obj(o.spots ?? {}, 'spots')).map(([loc, m]) => [loc, vecMap(m, `spots.${loc}`)]));
  layout.readables = v.arr(o.readables ?? [], 'readables', (x, p) => {
    const r = v.obj(x, p);
    v.noExtraKeys(r, ['id', 'at', 'title', 'text', 'dynamic', 'propertyId'], p);
    const spec: ReadableSpec = { id: v.str(r.id, `${p}.id`), at: vec(r.at, `${p}.at`), title: v.str(r.title, `${p}.title`), text: v.optStr(r.text, `${p}.text`), propertyId: v.optStr(r.propertyId, `${p}.propertyId`) };
    if (r.dynamic !== undefined) spec.dynamic = v.oneOf(r.dynamic, ['notice-board', 'tavern-news', 'market-prices', 'deed'] as const, `${p}.dynamic`);
    if (!spec.text && !spec.dynamic) v.fail(p, 'a readable needs text or a dynamic source');
    return spec;
  });
  layout.extras = v.arr(o.extras ?? [], 'extras', (x, p) => {
    const e = v.obj(x, p);
    v.noExtraKeys(e, ['kind', 'at', 'path', 'hours', 'color'], p);
    const spec: ExtraSpec = { kind: v.oneOf(e.kind, ['villager', 'patron', 'chicken', 'sheep', 'crow', 'cat'] as const, `${p}.kind`), color: v.optStr(e.color, `${p}.color`) };
    if (e.at !== undefined) spec.at = vec(e.at, `${p}.at`);
    if (e.path !== undefined) spec.path = v.arr(e.path, `${p}.path`, (q, qp) => vec(q, qp));
    if (e.hours !== undefined) {
      const h = v.arr(e.hours, `${p}.hours`, (n, np) => v.num(n, np, 0, 24));
      spec.hours = [h[0] ?? 0, h[1] ?? 24];
    }
    if (!spec.at && !spec.path?.length) v.fail(p, 'an extra needs `at` or a `path`');
    return spec;
  });
  layout.water = v.arr(o.water ?? [], 'water', (x, p) => rect(x, p));
  const amb = v.obj(o.ambient ?? {}, 'ambient');
  layout.ambient = {
    leaves: amb.leaves === undefined ? 0 : v.num(amb.leaves, 'ambient.leaves', 0, 500),
    smoke: v.arr(amb.smoke ?? [], 'ambient.smoke', (x, p) => {
      const a = v.arr(x, p, (n, np) => v.num(n, np));
      if (a.length !== 3) v.fail(p, 'expected [x, z, height]');
      return [a[0] ?? 0, a[1] ?? 0, a[2] ?? 5] as [number, number, number];
    }),
    fireflies: amb.fireflies === undefined ? false : v.bool(amb.fireflies, 'ambient.fireflies'),
  };
  layout.stalls = vecMap(o.stalls, 'stalls');
  return v.ok ? ok(layout) : err('INVALID_CONTENT', v.errors.join('\n'));
}
