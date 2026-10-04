import { err, ok, type Result } from '../core/result';
import type { ActorId, LocationId, RouteId } from '../core/refs';
import { emit, type SimContext } from './context';
import type { Location, Route, RouteStatus } from './types';

export interface PathResult {
  locations: LocationId[];
  routes: RouteId[];
  travelTimeMs: number;
}

/**
 * Locations, routes, travel and discovery. Travel is between locations over
 * routes; fine-grained movement inside a scene is a presentation concern.
 */
export class WorldService {
  constructor(private readonly ctx: SimContext) {}

  location(id: LocationId): Location | undefined {
    return this.ctx.state.locations[id];
  }

  children(id: LocationId): Location[] {
    return Object.values(this.ctx.state.locations).filter((l) => l.parentId === id);
  }

  /** The location followed by its parents, innermost first. Cycle-safe. */
  lineage(id: LocationId): LocationId[] {
    const out: LocationId[] = [];
    let cur: LocationId | undefined = id;
    while (cur && !out.includes(cur)) {
      out.push(cur);
      cur = this.ctx.state.locations[cur]?.parentId;
    }
    return out;
  }

  isWithin(id: LocationId, ancestor: LocationId): boolean {
    return this.lineage(id).includes(ancestor);
  }

  routesFrom(id: LocationId, includeClosed = false): { route: Route; to: LocationId }[] {
    const out: { route: Route; to: LocationId }[] = [];
    for (const r of Object.values(this.ctx.state.routes)) {
      if (!includeClosed && r.status === 'closed') continue;
      if (r.from === id) out.push({ route: r, to: r.to });
      else if (r.bidirectional && r.to === id) out.push({ route: r, to: r.from });
    }
    return out;
  }

  /** Shortest travel-time path over open (and hazardous) routes. Dijkstra. */
  findPath(from: LocationId, to: LocationId): PathResult | undefined {
    if (from === to) return { locations: [from], routes: [], travelTimeMs: 0 };
    const dist = new Map<LocationId, number>([[from, 0]]);
    const prev = new Map<LocationId, { via: RouteId; from: LocationId }>();
    const open = new Set<LocationId>([from]);
    const done = new Set<LocationId>();
    while (open.size) {
      let cur: LocationId | undefined;
      for (const c of open) if (cur === undefined || dist.get(c)! < dist.get(cur)!) cur = c;
      open.delete(cur!);
      if (cur === to) break;
      done.add(cur!);
      for (const { route, to: next } of this.routesFrom(cur!)) {
        if (done.has(next)) continue;
        const d = dist.get(cur!)! + route.travelTimeMs;
        if (d < (dist.get(next) ?? Infinity)) {
          dist.set(next, d);
          prev.set(next, { via: route.id, from: cur! });
          open.add(next);
        }
      }
    }
    if (!dist.has(to)) return undefined;
    const locations: LocationId[] = [to];
    const routes: RouteId[] = [];
    let cur = to;
    while (cur !== from) {
      const p = prev.get(cur)!;
      routes.unshift(p.via);
      locations.unshift(p.from);
      cur = p.from;
    }
    return { locations, routes, travelTimeMs: dist.get(to)! };
  }

  /** Move an actor to a location reachable by route. Discovers it on arrival. */
  travel(actorId: ActorId, to: LocationId): Result<PathResult> {
    const actor = this.ctx.state.actors[actorId];
    if (!actor) return err('UNKNOWN_ACTOR', `no actor ${actorId}`);
    if (!this.location(to)) return err('UNKNOWN_LOCATION', `no location ${to}`);
    const from = actor.locationId;
    const path = from ? this.findPath(from, to) : { locations: [to], routes: [], travelTimeMs: 0 };
    if (!path) return err('NO_ROUTE', `no open route to ${to}`);
    actor.locationId = to;
    emit(this.ctx, 'actor.travelled', { actorId, from, to, travelTimeMs: path.travelTimeMs }, {
      sourceSystem: 'world',
      actor: actorId,
      location: to,
    });
    this.discover(actorId, to);
    return ok(path);
  }

  /** Place an actor without travel (spawning, loading). */
  place(actorId: ActorId, at: LocationId): Result<true> {
    const actor = this.ctx.state.actors[actorId];
    if (!actor) return err('UNKNOWN_ACTOR', `no actor ${actorId}`);
    if (!this.location(at)) return err('UNKNOWN_LOCATION', `no location ${at}`);
    actor.locationId = at;
    return ok(true);
  }

  hasDiscovered(actorId: ActorId, id: LocationId): boolean {
    return this.ctx.state.discoveries[actorId]?.includes(id) ?? false;
  }

  /** Returns true the first time an actor discovers a location. */
  discover(actorId: ActorId, id: LocationId): boolean {
    if (this.hasDiscovered(actorId, id)) return false;
    (this.ctx.state.discoveries[actorId] ??= []).push(id);
    const loc = this.location(id);
    emit(this.ctx, 'location.discovered', { actorId, locationId: id }, {
      sourceSystem: 'world',
      actor: actorId,
      location: id,
      outcome: 'discovered',
      summary: `Discovered ${loc?.name ?? id}`,
      chronicle: true,
    });
    return true;
  }

  setRouteStatus(routeId: RouteId, status: RouteStatus, reason: string): Result<Route> {
    const route = this.ctx.state.routes[routeId];
    if (!route) return err('UNKNOWN_ROUTE', `no route ${routeId}`);
    const previous = route.status;
    if (previous === status) return ok(route);
    route.status = status;
    emit(this.ctx, 'route.status-changed', { routeId, previous, status, reason }, {
      sourceSystem: 'world',
      location: route.from,
      outcome: status,
      summary: `Route ${routeId} is now ${status} (${reason})`,
      visibility: 'realm',
      chronicle: true,
    });
    return ok(route);
  }
}
