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
  paths: { rect: Rect; color: string }[];
  props: PropSpec[];
}

export function parseSceneLayout(raw: unknown, source = 'scene'): Result<SceneLayout> {
  const v = new Validator(source);
  const o = v.obj(raw, '');
  v.noExtraKeys(o, ['id', 'name', 'size', 'ground', 'interior', 'backdrops', 'zones', 'spawns', 'playerStart', 'exits', 'npcs', 'nodes', 'paths', 'props'], '');
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
      return { rect: rect(pa.rect, `${p}.rect`), color: v.str(pa.color, `${p}.color`) };
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
  };
  return v.ok ? ok(layout) : err('INVALID_CONTENT', v.errors.join('\n'));
}
