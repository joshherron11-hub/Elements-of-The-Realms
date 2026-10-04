import type { ActorId, LocationId } from '../core/refs';
import { emit, type SimContext } from './context';
import { gameTime, routineAt } from './living';
import type { WorldService } from './world';

/**
 * NPC daily routines. Each tick, every NPC with a routine is placed where the
 * hour says they should be, doing what it says. Deterministic (a pure function
 * of the world clock), never chronicled — an innkeeper going to bed is not
 * history — and recomputed after loading, so saves stay small and correct.
 */
export class RoutineService {
  constructor(
    private readonly ctx: SimContext,
    private readonly world: WorldService,
  ) {}

  tick(): void {
    const { routines, calendar } = this.ctx.living;
    const now = this.ctx.clock.now();
    const t = gameTime(this.ctx.state, now, calendar);
    for (const [actorId, entries] of Object.entries(routines)) {
      const actor = this.ctx.state.actors[actorId];
      const e = routineAt(entries, t.hour);
      if (!actor || !e) continue;
      const prev = this.ctx.state.npcActivity[actorId];
      const from = actor.locationId;
      const moved = from !== e.locationId;
      if (moved) this.world.place(actorId as ActorId, e.locationId as LocationId);
      if (moved || !prev || prev.activity !== e.activity || prev.spot !== e.spot) {
        this.ctx.state.npcActivity[actorId] = { activity: e.activity, spot: e.spot, locationId: e.locationId, since: now };
        emit(this.ctx, 'npc.routine', { actorId, from: from ?? null, to: e.locationId, activity: e.activity, spot: e.spot ?? null }, { sourceSystem: 'routines' });
      }
    }
  }

  activityOf(actorId: string) {
    return this.ctx.state.npcActivity[actorId];
  }
}
