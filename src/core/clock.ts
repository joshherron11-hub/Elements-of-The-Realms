/**
 * Time sources.
 *
 * Simulation never reads Date.now() directly; it asks a Clock. This keeps
 * history reproducible in tests and lets Realms run their own calendars later.
 */
export interface Clock {
  /** Milliseconds since the Unix epoch (real time). */
  now(): number;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/** A clock that only moves when told to. Used in tests and replays. */
export class ManualClock implements Clock {
  constructor(private current = 0) {}
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    if (ms < 0) throw new Error('ManualClock cannot move backwards');
    this.current += ms;
  }
  set(ms: number): void {
    this.current = ms;
  }
}
