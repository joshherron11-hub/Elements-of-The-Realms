import { err, ok, type Result } from '../core/result';
import type { JsonValue } from '../core/refs';
import type { WorldState } from '../world/world-state';
import { migrateWorld } from './migrations';
import type { StorageAdapter } from './storage';

/**
 * SAVE GAMES
 *
 * A save is plain JSON: metadata, a checksum, the complete WorldState, and a
 * small presentation snapshot (which section, where the player stood). The
 * world is self-contained — loading never re-applies content packs, so a
 * world's history is exactly what was saved.
 */
export const SAVE_FORMAT = 'eotr-save';
export const SAVE_VERSION = 1;
const PREFIX = 'eotr:save:';

export interface SaveMeta {
  format: typeof SAVE_FORMAT;
  version: number;
  slot: string;
  label: string;
  savedAt: number;
  realmId: string;
  serverId: string;
  playerActorId: string;
  /** Simulation clock reading at save time (for catch-up on return). */
  worldTime: number;
  chronicleEntries: number;
}

export interface SaveFile {
  meta: SaveMeta;
  checksum: string;
  world: WorldState;
  presentation?: Record<string, JsonValue>;
}

export interface LoadedSave extends SaveFile {
  migratedFrom: number;
}

/** FNV-1a 32-bit — enough to detect truncation or tampering by accident. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class SaveService {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly now: () => number,
  ) {}

  save(
    slot: string,
    data: { world: WorldState; playerActorId: string; worldTime: number; label?: string; presentation?: Record<string, JsonValue> },
  ): Result<SaveMeta> {
    const worldJson = JSON.stringify(data.world);
    const meta: SaveMeta = {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      slot,
      label: data.label ?? `${data.world.realm.name} — ${new Date(this.now()).toISOString().slice(0, 16).replace('T', ' ')}`,
      savedAt: this.now(),
      realmId: data.world.realm.id,
      serverId: data.world.server.id,
      playerActorId: data.playerActorId,
      worldTime: data.worldTime,
      chronicleEntries: data.world.chronicle.length,
    };
    // Assemble by hand so the world JSON is embedded exactly as checksummed.
    const file = `{"meta":${JSON.stringify(meta)},"checksum":"${checksum(worldJson)}","presentation":${JSON.stringify(data.presentation ?? {})},"world":${worldJson}}`;
    try {
      this.storage.set(PREFIX + slot, file);
    } catch (e) {
      return err('STORAGE_FAILED', `could not write save: ${(e as Error).message}`);
    }
    return ok(meta);
  }

  has(slot: string): boolean {
    return this.storage.get(PREFIX + slot) !== null;
  }

  load(slot: string): Result<LoadedSave> {
    const text = this.storage.get(PREFIX + slot);
    if (text === null) return err('NO_SAVE', `no save in slot "${slot}"`);
    return this.parse(text);
  }

  /** Validate and migrate a save file's text. */
  parse(text: string): Result<LoadedSave> {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return err('CORRUPT_SAVE', 'save is not valid JSON');
    }
    const meta = raw.meta as SaveMeta | undefined;
    if (!meta || meta.format !== SAVE_FORMAT) return err('NOT_A_SAVE', 'not an Elements of the Realms save');
    if (typeof meta.version !== 'number' || meta.version > SAVE_VERSION) return err('NEWER_SAVE', `save format ${meta.version} is newer than this build (${SAVE_VERSION})`);
    const world = raw.world as Record<string, unknown> | undefined;
    if (!world || typeof world !== 'object') return err('CORRUPT_SAVE', 'save has no world');
    if (raw.checksum !== checksum(JSON.stringify(world))) return err('CORRUPT_SAVE', 'save checksum does not match — the file is damaged');
    try {
      const m = migrateWorld(world);
      const w = m.world;
      if (!w.realm?.id || !w.server?.id || !w.actors || !w.chronicle) return err('CORRUPT_SAVE', 'save world is missing required parts');
      if (!w.actors[meta.playerActorId]) return err('CORRUPT_SAVE', 'save player does not exist in its world');
      return ok({ meta, checksum: raw.checksum as string, world: w, presentation: (raw.presentation as Record<string, JsonValue>) ?? {}, migratedFrom: m.from });
    } catch (e) {
      return err('MIGRATION_FAILED', (e as Error).message);
    }
  }

  list(): SaveMeta[] {
    return this.storage
      .keys()
      .filter((k) => k.startsWith(PREFIX))
      .map((k) => {
        try {
          const meta = (JSON.parse(this.storage.get(k) ?? '{}') as SaveFile).meta;
          return meta && { ...meta, slot: k.slice(PREFIX.length) };
        } catch {
          return undefined;
        }
      })
      .filter((m): m is SaveMeta => !!m && m.format === SAVE_FORMAT)
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  delete(slot: string): void {
    this.storage.remove(PREFIX + slot);
  }

  /** The raw save text, for backups / moving between browsers. */
  export(slot: string): string | null {
    return this.storage.get(PREFIX + slot);
  }

  import(slot: string, text: string): Result<LoadedSave> {
    const parsed = this.parse(text);
    if (!parsed.ok) return parsed;
    try {
      this.storage.set(PREFIX + slot, text);
    } catch (e) {
      return err('STORAGE_FAILED', (e as Error).message);
    }
    return parsed;
  }
}
