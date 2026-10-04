import { err, ok, type Result } from '../core/result';
import type { ActorId, ItemId, LocationId } from '../core/refs';
import type { InventoryService } from '../economy/inventory';
import { emit, type SimContext } from './context';

/**
 * Something hidden at a location that searching can turn up: a lost
 * parcel, a clue, a forgotten keepsake. Each actor can find each spot once.
 */
export interface SearchSpot {
  readonly id: string;
  locationId: LocationId;
  itemId: ItemId;
  quantity: number;
  /** Shown in the Chronicle when found. */
  description: string;
  /** Optional: only discoverable while the actor holds this world flag (e.g. an accepted contract). */
  requiresFlag?: string;
  foundBy: ActorId[];
}

export interface SearchResult {
  found: { spotId: string; itemId: ItemId; quantity: number; description: string }[];
}

export class SearchService {
  constructor(
    private readonly ctx: SimContext,
    private readonly inventory: InventoryService,
  ) {}

  /** Search the actor's current location. Finding nothing is a normal outcome. */
  search(actorId: ActorId): Result<SearchResult> {
    const actor = this.ctx.state.actors[actorId];
    if (!actor) return err('UNKNOWN_ACTOR', `no actor ${actorId}`);
    if (!actor.locationId) return err('NOWHERE', 'actor is not anywhere');
    const found: SearchResult['found'] = [];
    for (const spot of Object.values(this.ctx.state.searchSpots)) {
      if (spot.locationId !== actor.locationId || spot.foundBy.includes(actorId)) continue;
      if (spot.requiresFlag && !this.ctx.state.flags[`${spot.requiresFlag}:${actorId}`]) continue;
      const added = this.inventory.add({ kind: 'actor', id: actorId }, spot.itemId, spot.quantity, 'found while searching');
      if (!added.ok) continue;
      spot.foundBy.push(actorId);
      found.push({ spotId: spot.id, itemId: spot.itemId, quantity: spot.quantity, description: spot.description });
      emit(this.ctx, 'search.found', { spotId: spot.id, itemId: spot.itemId, quantity: spot.quantity }, {
        sourceSystem: 'search',
        actor: actorId,
        location: actor.locationId,
        outcome: 'found',
        summary: spot.description,
        chronicle: true,
      });
    }
    if (!found.length) {
      emit(this.ctx, 'search.nothing', { locationId: actor.locationId }, { sourceSystem: 'search', actor: actorId, location: actor.locationId });
    }
    return ok({ found });
  }
}
