/**
 * Seeded, serialisable pseudo-random generator (mulberry32).
 *
 * Simulation never calls Math.random(). Randomness (risk outcomes, market
 * drift) comes from an Rng whose state lives in WorldState, so a saved world
 * reloads with the same future and tests are reproducible.
 */
export interface RngState {
  seed: number;
  state: number;
}

export class Rng {
  constructor(private readonly s: RngState) {}

  static createState(seed: number): RngState {
    const n = seed >>> 0;
    return { seed: n, state: n };
  }

  /** Float in [0, 1). */
  next(): number {
    this.s.state = (this.s.state + 0x6d2b79f5) >>> 0;
    let t = this.s.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Pick by non-negative weights. Throws on empty / all-zero input (programmer error). */
  weighted<T>(entries: readonly { weight: number; value: T }[]): T {
    const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
    if (total <= 0) throw new Error('Rng.weighted requires a positive total weight');
    let roll = this.next() * total;
    for (const e of entries) {
      roll -= Math.max(0, e.weight);
      if (roll < 0) return e.value;
    }
    return entries[entries.length - 1]!.value;
  }
}
