import { WORLD_SCHEMA_VERSION, createWorldState, type WorldState } from '../world/world-state';

/**
 * World schema migrations. Each entry upgrades a world from version N to
 * N + 1. Add one whenever WORLD_SCHEMA_VERSION is bumped; never edit an old
 * one. Migrations are pure data transforms — they decide nothing about play.
 */
export type WorldMigration = (world: Record<string, unknown>) => Record<string, unknown>;

export const WORLD_MIGRATIONS: Record<number, WorldMigration> = {
  // 1 → 2: (none yet)
};

export interface MigrationResult {
  world: WorldState;
  from: number;
  to: number;
  applied: number[];
}

export function migrateWorld(
  raw: Record<string, unknown>,
  migrations: Record<number, WorldMigration> = WORLD_MIGRATIONS,
  target = WORLD_SCHEMA_VERSION,
): MigrationResult {
  const from = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (from > target) throw new Error(`save is from a newer version (schema ${from}); this build understands up to ${target}`);
  let world = raw;
  const applied: number[] = [];
  for (let v = from; v < target; v++) {
    const m = migrations[v];
    if (!m) throw new Error(`no migration from schema ${v} to ${v + 1}`);
    world = { ...m(world), schemaVersion: v + 1 };
    applied.push(v);
  }
  return { world: normalizeWorld(world), from, to: target, applied };
}

/**
 * Fill in collections that newer builds added within the same schema version
 * (additive, empty defaults only). Never changes existing data.
 */
export function normalizeWorld(world: Record<string, unknown>): WorldState {
  const template = createWorldState({
    realm: { id: 'realm_x' as never, name: 'x', type: 'ANCHORED' },
    server: { id: 'server_x' as never, name: 'x', preset: 'PEACEFUL' },
    seed: 0,
    now: 0,
  }) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...world };
  for (const [k, v] of Object.entries(template)) {
    if (out[k] === undefined) out[k] = JSON.parse(JSON.stringify(v));
  }
  return out as unknown as WorldState;
}
