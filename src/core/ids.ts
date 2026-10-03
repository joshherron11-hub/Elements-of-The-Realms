/**
 * Branded identifiers.
 *
 * Every kernel object is referenced by a string id carrying a compile-time
 * brand, so an ActorId can never be passed where a LocationId is expected.
 * Ids are plain strings at runtime, which keeps them trivially serialisable.
 */
export type Id<Brand extends string> = string & { readonly __brand: Brand };

/** Produces new ids. Injected so tests and replays can be deterministic. */
export interface IdFactory {
  next<Brand extends string>(prefix: Brand): Id<Brand>;
}

/** Random ids for live play. Uses crypto.randomUUID when available. */
export class RandomIdFactory implements IdFactory {
  next<Brand extends string>(prefix: Brand): Id<Brand> {
    const g = globalThis as { crypto?: { randomUUID?: () => string } };
    const raw =
      g.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}_${raw}` as Id<Brand>;
  }
}

/** Sequential ids for tests, fixtures and deterministic replay. */
export class SequentialIdFactory implements IdFactory {
  private counter: number;
  constructor(start = 1) {
    this.counter = start;
  }
  next<Brand extends string>(prefix: Brand): Id<Brand> {
    return `${prefix}_${(this.counter++).toString().padStart(6, '0')}` as Id<Brand>;
  }
}

/** Cast a known string (e.g. from authored data) to a branded id. */
export function asId<Brand extends string>(value: string): Id<Brand> {
  return value as Id<Brand>;
}
