import type { Clock } from '../core/clock';
import { asId, type IdFactory } from '../core/ids';
import type { ActorId } from '../core/refs';
import type { ContentRegistry } from '../config/content';
import type { SaveService } from '../persistence/saves';
import { bootstrapWorld, joinRealm } from '../seed';
import { Simulation } from '../simulation';

/** PROVISIONAL: at most this much time away is simulated when you return (Familiars get hungry, markets drift). */
export const MAX_CATCH_UP_MS = 2 * 60 * 60 * 1000;
export const SAVE_SLOT = 'main';

export interface Session {
  sim: Simulation;
  playerId: ActorId;
  resumed: boolean;
  /** Where the player stood, if resuming. */
  presentation?: { sceneId?: string; position?: [number, number] };
  /** How long they were away (ms), if resuming. */
  awayMs?: number;
  /** Set if a save existed but could not be loaded. */
  loadError?: string;
}

export interface SessionOptions {
  content: ContentRegistry;
  saves: SaveService;
  serverId: string;
  startLocation: string;
  clock?: Clock;
  ids?: IdFactory;
  newWorldSeed: number;
  displayName: string;
}

/**
 * Continue the saved world if there is one, otherwise found a new one.
 * Application glue between persistence, content and the simulation; it makes
 * no gameplay decisions itself.
 */
export function openSession(o: SessionOptions): Session {
  let loadError: string | undefined;
  if (o.saves.has(SAVE_SLOT)) {
    const loaded = o.saves.load(SAVE_SLOT);
    if (loaded.ok) {
      const { meta, world, presentation } = loaded.value;
      const rules = o.content.rulesFor(meta.serverId);
      const sim = new Simulation({ state: world, rules, modes: o.content.modes, living: o.content.living(rules.realm.id), clock: o.clock, ids: o.ids }).start();
      const awayMs = Math.max(0, sim.ctx.clock.now() - meta.worldTime);
      const catchUp = Math.min(awayMs, MAX_CATCH_UP_MS);
      if (catchUp > 0) sim.tick(catchUp);
      const p = presentation as { sceneId?: string; position?: [number, number] } | undefined;
      return { sim, playerId: meta.playerActorId as ActorId, resumed: true, presentation: p, awayMs };
    }
    loadError = loaded.error.message;
  }
  const rules = o.content.rulesFor(o.serverId);
  const booted = bootstrapWorld({ rules, pack: o.content.pack(rules.realm.id), modes: o.content.modes, living: o.content.living(rules.realm.id), seed: o.newWorldSeed, clock: o.clock, ids: o.ids });
  if (!booted.ok) throw new Error(booted.error.message);
  const joined = joinRealm(booted.value, { displayName: o.displayName, startAt: asId(o.startLocation) });
  if (!joined.ok) throw new Error(joined.error.message);
  return { sim: booted.value, playerId: joined.value.actor.id, resumed: false, loadError };
}

export function saveSession(saves: SaveService, s: { sim: Simulation; playerId: ActorId }, presentation: { sceneId: string; position: [number, number] }) {
  return saves.save(SAVE_SLOT, {
    world: s.sim.state,
    playerActorId: s.playerId,
    worldTime: s.sim.ctx.clock.now(),
    presentation: { sceneId: presentation.sceneId, position: presentation.position },
  });
}
