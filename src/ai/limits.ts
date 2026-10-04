/**
 * Rate limiting (token bucket) and per-user allowance (daily budget).
 * Time is injected so tests are deterministic.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
    private readonly now: () => number,
  ) {}

  /** Take one token for `key` if available. */
  take(key: string): boolean {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: t };
    b.tokens = Math.min(this.capacity, b.tokens + (t - b.at) * this.refillPerMs);
    b.at = t;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    return ok;
  }
}

export interface AllowancePolicy {
  /** Tokens (in + out) per user per day. */
  dailyTokens: number;
  /** Spend per user per day, in micro-units. */
  dailyCostMicros: number;
}

const DAY = 24 * 3600_000;

export class Allowances {
  private readonly used = new Map<string, { day: number; tokens: number; cost: number }>();

  constructor(
    private readonly policy: AllowancePolicy,
    private readonly now: () => number,
    private readonly overrides: Record<string, Partial<AllowancePolicy>> = {},
  ) {}

  private entry(userId: string) {
    const day = Math.floor(this.now() / DAY);
    let e = this.used.get(userId);
    if (!e || e.day !== day) {
      e = { day, tokens: 0, cost: 0 };
      this.used.set(userId, e);
    }
    return e;
  }

  limitFor(userId: string): AllowancePolicy {
    return { ...this.policy, ...this.overrides[userId] };
  }

  /** Could this user afford roughly `tokens` more today? */
  canSpend(userId: string, tokens: number): boolean {
    const e = this.entry(userId);
    const lim = this.limitFor(userId);
    return e.tokens + tokens <= lim.dailyTokens && e.cost < lim.dailyCostMicros;
  }

  record(userId: string, tokens: number, costMicros: number): void {
    const e = this.entry(userId);
    e.tokens += tokens;
    e.cost += costMicros;
  }

  remaining(userId: string): { tokens: number; costMicros: number } {
    const e = this.entry(userId);
    const lim = this.limitFor(userId);
    return { tokens: Math.max(0, lim.dailyTokens - e.tokens), costMicros: Math.max(0, lim.dailyCostMicros - e.cost) };
  }
}
