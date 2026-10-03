import { err, ok, type Result } from '../core/result';
import type { RiskProfileId } from '../core/refs';
import type { SimContext } from '../world/context';
import type { RiskOutcome, RiskProfile } from './types';

export interface RiskResolution {
  profileId: RiskProfileId;
  outcome: RiskOutcome;
  stake: number;
  /** Integer value returned for the stake. May be less than, equal to or more than it. */
  returned: number;
}

/**
 * Risk without war: market swings, lost shipments, failed ventures. Pure
 * resolution over the seeded Rng — the caller decides what the outcome means
 * (pay out, burn, adjust a price index).
 */
export class RiskService {
  constructor(private readonly ctx: SimContext) {}

  get(id: RiskProfileId): RiskProfile | undefined {
    return this.ctx.state.risks[id];
  }

  resolve(profileId: RiskProfileId, stake: number): Result<RiskResolution> {
    const profile = this.get(profileId);
    if (!profile) return err('UNKNOWN_RISK', `no risk profile ${profileId}`);
    if (!profile.outcomes.length) return err('EMPTY_RISK', `risk profile ${profileId} has no outcomes`);
    const outcome = this.ctx.rng.weighted(profile.outcomes.map((o) => ({ weight: o.weight, value: o })));
    const returned = Math.max(0, Math.floor(stake * outcome.valueMultiplier));
    return ok({ profileId, outcome, stake, returned });
  }

  /** Expected multiplier of a profile — useful for UI ("risky", "safe"). */
  expectedMultiplier(profileId: RiskProfileId): number | undefined {
    const p = this.get(profileId);
    if (!p) return undefined;
    const total = p.outcomes.reduce((s, o) => s + o.weight, 0);
    return total > 0 ? p.outcomes.reduce((s, o) => s + o.weight * o.valueMultiplier, 0) / total : undefined;
  }
}
