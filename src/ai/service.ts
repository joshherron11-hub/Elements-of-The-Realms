import { err, ok, type Result } from '../core/result';
import { Allowances, RateLimiter, type AllowancePolicy } from './limits';
import { ResponseCache, cacheKey } from './cache';
import { TASK_POLICY, densityAllows, type TaskPolicy } from './policy';
import { estimateTokens } from './providers';
import {
  AI_TASKS,
  DETERMINISTIC_ONLY,
  type AiContext,
  type AiProvider,
  type AiRequest,
  type AiResponse,
  type AiTask,
  type ModelInfo,
  type ModelTier,
  type UsageRecord,
} from './types';

export interface AiServiceOptions {
  /** In order of preference. */
  providers: AiProvider[];
  now: () => number;
  allowance?: AllowancePolicy;
  allowanceOverrides?: Record<string, Partial<AllowancePolicy>>;
  rate?: { perUserPerMinute: number; globalPerMinute: number };
  cacheEntries?: number;
  policy?: Record<AiTask, TaskPolicy>;
  /** Sink for usage records (e.g. send to a server). Records are also kept in memory. */
  onUsage?: (u: UsageRecord) => void;
}

const TIER_ORDER: ModelTier[] = ['small', 'medium', 'large'];

/**
 * Provider-agnostic AI gateway: deterministic guard → density gate →
 * routing → cache → rate limit → allowance → provider → cost log.
 * Every refusal is an ordinary Result, so callers fall back to authored
 * content. Nothing here touches simulation state.
 */
export class AiService {
  private readonly cache: ResponseCache<AiResponse>;
  private readonly userRate: RateLimiter;
  private readonly globalRate: RateLimiter;
  private readonly allowances: Allowances;
  private readonly policy: Record<AiTask, TaskPolicy>;
  private readonly log: UsageRecord[] = [];

  constructor(private readonly o: AiServiceOptions) {
    const rate = o.rate ?? { perUserPerMinute: 10, globalPerMinute: 120 };
    this.userRate = new RateLimiter(rate.perUserPerMinute, rate.perUserPerMinute / 60_000, o.now);
    this.globalRate = new RateLimiter(rate.globalPerMinute, rate.globalPerMinute / 60_000, o.now);
    // PROVISIONAL default allowance and rate limits — placeholders until real pricing exists.
    this.allowances = new Allowances(o.allowance ?? { dailyTokens: 50_000, dailyCostMicros: 200_000 }, o.now, o.allowanceOverrides);
    this.cache = new ResponseCache(o.cacheEntries ?? 500, o.now);
    this.policy = o.policy ?? TASK_POLICY;
  }

  /** Pick a provider + model for a task: exact tier first, then the nearest other tiers. */
  route(task: AiTask): { provider: AiProvider; model: ModelInfo } | undefined {
    const want = TIER_ORDER.indexOf(this.policy[task].tier);
    const order = [...TIER_ORDER].sort((a, b) => Math.abs(TIER_ORDER.indexOf(a) - want) - Math.abs(TIER_ORDER.indexOf(b) - want));
    for (const tier of order) {
      for (const provider of this.o.providers) {
        if (!provider.available()) continue;
        const model = provider.models.find((m) => m.tier === tier);
        if (model) return { provider, model };
      }
    }
    return undefined;
  }

  async request(req: AiRequest, ctx: AiContext): Promise<Result<AiResponse>> {
    const deny = (code: string, message: string): Result<never> => {
      this.record({ req, provider: '-', model: '-', tokensIn: 0, tokensOut: 0, costMicros: 0, cached: false, outcome: 'denied', reason: code });
      return err(code, message);
    };
    if ((DETERMINISTIC_ONLY as readonly string[]).includes(req.task)) {
      return deny('DETERMINISTIC_TASK', `"${req.task}" is deterministic gameplay and never uses AI`);
    }
    if (!(AI_TASKS as readonly string[]).includes(req.task)) return deny('UNKNOWN_TASK', `no AI task "${req.task}"`);
    const task = req.task as AiTask;
    const policy = this.policy[task];
    if (!densityAllows(ctx.density, policy.minDensity)) {
      return deny('DENSITY', `server AI density ${ctx.density} does not allow ${task} (needs ${policy.minDensity})`);
    }
    const route = this.route(task);
    if (!route) return deny('NO_PROVIDER', 'no AI provider is available');
    const maxOut = Math.min(req.maxOutputTokens ?? policy.maxOutputTokens, route.model.maxOutputTokens);
    const key = cacheKey([task, route.provider.id, route.model.id, req.instruction ?? '', req.input]);

    if (!req.fresh) {
      const hit = this.cache.get(key);
      if (hit) {
        const cached = { ...hit, cached: true, costMicros: 0 };
        this.record({ req, provider: hit.provider, model: hit.model, tokensIn: 0, tokensOut: 0, costMicros: 0, cached: true, outcome: 'ok' });
        return ok(cached);
      }
    }
    if (!this.userRate.take(`user:${req.userId}`)) return deny('RATE_LIMITED', 'too many AI requests — try again shortly');
    if (!this.globalRate.take('global')) return deny('RATE_LIMITED', 'the server is busy — try again shortly');
    const estimate = estimateTokens(JSON.stringify(req.input) + (req.instruction ?? '')) + maxOut;
    if (!this.allowances.canSpend(req.userId, estimate)) return deny('ALLOWANCE', 'daily AI allowance used up');

    try {
      const c = await route.provider.complete(route.model, { ...req, maxOutputTokens: maxOut });
      const costMicros = Math.ceil((c.tokensIn * route.model.costPerKIn + c.tokensOut * route.model.costPerKOut) / 1000);
      this.allowances.record(req.userId, c.tokensIn + c.tokensOut, costMicros);
      const res: AiResponse = { text: c.text, task, provider: route.provider.id, model: route.model.id, tokensIn: c.tokensIn, tokensOut: c.tokensOut, costMicros, cached: false };
      this.cache.set(key, res, policy.cacheTtlMs);
      this.record({ req, provider: res.provider, model: res.model, tokensIn: c.tokensIn, tokensOut: c.tokensOut, costMicros, cached: false, outcome: 'ok' });
      return ok(res);
    } catch (e) {
      this.record({ req, provider: route.provider.id, model: route.model.id, tokensIn: 0, tokensOut: 0, costMicros: 0, cached: false, outcome: 'error', reason: (e as Error).message });
      return err('PROVIDER_ERROR', (e as Error).message);
    }
  }

  /**
   * The pattern every caller uses: try AI if permitted, otherwise use the
   * authored/deterministic fallback. Play never depends on AI being present.
   */
  async withFallback(req: AiRequest, ctx: AiContext, fallback: () => string): Promise<{ text: string; source: 'ai' | 'authored'; reason?: string }> {
    const r = await this.request(req, ctx);
    return r.ok ? { text: r.value.text, source: 'ai' } : { text: fallback(), source: 'authored', reason: r.error.code };
  }

  usage(): readonly UsageRecord[] {
    return this.log;
  }

  totals(userId?: string): { requests: number; tokens: number; costMicros: number; cached: number; denied: number } {
    const rows = this.log.filter((u) => !userId || u.userId === userId);
    return {
      requests: rows.filter((u) => u.outcome === 'ok').length,
      tokens: rows.reduce((s, u) => s + u.tokensIn + u.tokensOut, 0),
      costMicros: rows.reduce((s, u) => s + u.costMicros, 0),
      cached: rows.filter((u) => u.cached).length,
      denied: rows.filter((u) => u.outcome === 'denied').length,
    };
  }

  remainingAllowance(userId: string) {
    return this.allowances.remaining(userId);
  }

  private record(r: Omit<UsageRecord, 'at' | 'userId' | 'task'> & { req: AiRequest }): void {
    const { req, ...rest } = r;
    const u: UsageRecord = { at: this.o.now(), userId: req.userId, task: req.task, ...rest };
    this.log.push(u);
    this.o.onUsage?.(u);
  }
}
