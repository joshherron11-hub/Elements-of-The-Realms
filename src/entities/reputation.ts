import type { OwnerRef, ScopeRef } from '../core/refs';

/**
 * Reputation is always scoped: standing in Blackmere, with the Merchants'
 * Guild, within a Realm. There is deliberately no unscoped/global reputation
 * — the platform has no universal human score or rank.
 */
export interface Reputation {
  readonly subject: OwnerRef;
  readonly scope: ScopeRef;
  /** -100 … +100 */
  value: number;
  updatedAt: number;
}

export const REPUTATION_BOUNDS = [-100, 100] as const;
