import type { Clock } from '../core/clock';
import type { EventBus, KernelEvent } from '../core/events';
import type { IdFactory } from '../core/ids';
import type { ActorId, LocationId, PlatformDomain } from '../core/refs';
import type { Rng } from '../core/rng';
import type { ChronicleVisibility } from '../chronicle/types';
import type { WorldState } from './world-state';
import type { ResolvedRules } from './constitution';

/**
 * Metadata every domain event carries. If `chronicle` is true, the Chronicle
 * records the event. Systems decide what is meaningful; the Chronicle decides
 * how to store it.
 */
export interface EventMeta {
  sourceSystem: string;
  actor?: ActorId;
  location?: LocationId;
  participants?: ActorId[];
  outcome?: string;
  summary?: string;
  domain?: PlatformDomain;
  visibility?: ChronicleVisibility;
  chronicle?: boolean;
}

export interface DomainEvent<P = Record<string, unknown>> extends KernelEvent<string, P> {
  readonly meta: EventMeta;
}

/** Everything a simulation service needs. Injected, never global. */
export interface SimContext {
  readonly state: WorldState;
  readonly clock: Clock;
  readonly ids: IdFactory;
  readonly events: EventBus;
  readonly rng: Rng;
  /** Effective Realm + server rules, when running under a constitution. */
  readonly rules?: ResolvedRules;
  /** Current mode name, set by the mode layer. */
  mode?: string;
}

export function emit<P extends Record<string, unknown>>(ctx: SimContext, type: string, payload: P, meta: EventMeta): void {
  const event: DomainEvent<P> = { type, at: ctx.clock.now(), payload, meta };
  ctx.events.emit(event);
}
