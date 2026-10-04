import { describe, expect, it } from 'vitest';
import { content } from '../src/config/content';
import {
  AiService,
  OfflineProvider,
  ScriptedProvider,
  TASK_POLICY,
  narrate,
  narrateDeterministic,
  type AiRequest,
  type ModelInfo,
} from '../src/ai';
import { ManualClock } from '../src/core';

const small: ModelInfo = { id: 'tiny', tier: 'small', costPerKIn: 100, costPerKOut: 400, maxOutputTokens: 500 };
const medium: ModelInfo = { id: 'mid', tier: 'medium', costPerKIn: 1000, costPerKOut: 4000, maxOutputTokens: 1000 };
const large: ModelInfo = { id: 'big', tier: 'large', costPerKIn: 5000, costPerKOut: 20000, maxOutputTokens: 2000 };

function service(opts: Partial<ConstructorParameters<typeof AiService>[0]> = {}) {
  const clock = new ManualClock(1_000_000);
  const provider = new ScriptedProvider('scripted', [small, medium, large], (r) => `ai:${r.task}:${JSON.stringify(r.input)}`);
  const ai = new AiService({ providers: [provider], now: () => clock.now(), ...opts });
  return { ai, provider, clock };
}
const req = (task: string, input: AiRequest['input'] = { q: 'hello' }, userId = 'u1'): AiRequest => ({ task, userId, input });
const RICH = { density: 'RICH' as const };

describe('AI is never used for deterministic gameplay', () => {
  it.each(['movement', 'inventory', 'crop-timer', 'merchant-arithmetic', 'property-check', 'save-load', 'state-change', 'canonical-derivation'])(
    'refuses "%s"',
    async (task) => {
      const { ai, provider } = service();
      const r = await ai.request(req(task), { density: 'CINEMATIC' });
      expect(!r.ok && r.error.code).toBe('DETERMINISTIC_TASK');
      expect(provider.calls).toBe(0);
    },
  );

  it('refuses unknown tasks', async () => {
    const { ai } = service();
    const r = await ai.request(req('make-me-rich'), { density: 'CINEMATIC' });
    expect(!r.ok && r.error.code).toBe('UNKNOWN_TASK');
  });
});

describe('server AI density', () => {
  it('MINIMAL (the default) allows only cheap retrieval; richer tasks need richer servers', async () => {
    const { ai, provider } = service();
    const min = { density: 'MINIMAL' as const };
    expect((await ai.request(req('npc-dialogue'), min)).ok).toBe(false);
    expect((await ai.request(req('chronicle-prose'), min)).ok).toBe(false);
    expect((await ai.request(req('semantic-search'), min)).ok).toBe(true);
    expect((await ai.request(req('rumor-synthesis'), { density: 'STANDARD' })).ok).toBe(false);
    expect((await ai.request(req('rumor-synthesis'), RICH)).ok).toBe(true);
    expect((await ai.request(req('agent-planning'), RICH)).ok).toBe(false);
    expect((await ai.request(req('agent-planning'), { density: 'CINEMATIC' })).ok).toBe(true);
    expect(provider.calls).toBe(3);
  });

  it('the Blackmere server runs at MINIMAL', () => {
    expect(content.rulesFor('server_happy-fall-blackmere').variables.aiDensity).toBe('MINIMAL');
  });
});

describe('routing and model selection', () => {
  it('routes each task to its policy tier', async () => {
    const { ai } = service();
    expect(ai.route('npc-dialogue')!.model.id).toBe('tiny');
    expect(ai.route('chronicle-prose')!.model.id).toBe('mid');
    expect(ai.route('political-proposal')!.model.id).toBe('big');
  });

  it('falls to the nearest tier and skips unavailable providers', () => {
    const down = new ScriptedProvider('down', [medium], undefined, { available: false });
    const onlySmall = new ScriptedProvider('small-only', [small]);
    const ai = new AiService({ providers: [down, onlySmall], now: () => 0 });
    expect(ai.route('chronicle-prose')).toMatchObject({ provider: { id: 'small-only' }, model: { id: 'tiny' } });
    const none = new AiService({ providers: [down], now: () => 0 });
    expect(none.route('chronicle-prose')).toBeUndefined();
  });

  it('reports provider failures as results, not crashes', async () => {
    const broken = new ScriptedProvider('broken', [small, medium, large], undefined, { fail: true });
    const ai = new AiService({ providers: [broken], now: () => 0 });
    const r = await ai.request(req('npc-dialogue'), RICH);
    expect(!r.ok && r.error.code).toBe('PROVIDER_ERROR');
    expect(ai.usage().at(-1)!.outcome).toBe('error');
  });
});

describe('token / cost logging and caching', () => {
  it('logs tokens and cost per request and caches repeat requests for free', async () => {
    const { ai, provider } = service();
    const a = await ai.request(req('npc-dialogue', { npc: 'Maren', topic: 'cider' }), RICH);
    expect(a.ok && a.value.cached).toBe(false);
    const cost = a.ok ? a.value.costMicros : -1;
    expect(cost).toBeGreaterThan(0);
    const b = await ai.request(req('npc-dialogue', { topic: 'cider', npc: 'Maren' }), RICH); // same input, different key order
    expect(b.ok && b.value).toMatchObject({ cached: true, costMicros: 0 });
    expect(provider.calls).toBe(1);
    const fresh = await ai.request({ ...req('npc-dialogue', { npc: 'Maren', topic: 'cider' }), fresh: true }, RICH);
    expect(fresh.ok && fresh.value.cached).toBe(false);
    expect(ai.totals('u1')).toMatchObject({ requests: 3, cached: 1, costMicros: cost * 2 });
  });

  it('does not cache tasks whose policy forbids it', async () => {
    const { ai, provider } = service();
    expect(TASK_POLICY['creator-assist'].cacheTtlMs).toBe(0);
    await ai.request(req('creator-assist'), RICH);
    await ai.request(req('creator-assist'), RICH);
    expect(provider.calls).toBe(2);
  });

  it('cached answers expire', async () => {
    const { ai, provider, clock } = service();
    await ai.request(req('npc-dialogue'), RICH);
    clock.advance(TASK_POLICY['npc-dialogue'].cacheTtlMs + 1);
    await ai.request(req('npc-dialogue'), RICH);
    expect(provider.calls).toBe(2);
  });
});

describe('rate limits and user allowance', () => {
  it('limits requests per user per minute, and refills', async () => {
    const { ai, clock } = service({ rate: { perUserPerMinute: 2, globalPerMinute: 100 } });
    const results = [];
    for (let i = 0; i < 3; i++) results.push((await ai.request({ ...req('npc-dialogue', { i }), fresh: true }, RICH)).ok);
    expect(results).toEqual([true, true, false]);
    expect((await ai.request({ ...req('npc-dialogue', { i: 9 }, 'u2'), fresh: true }, RICH)).ok).toBe(true); // other user unaffected
    clock.advance(30_000);
    expect((await ai.request({ ...req('npc-dialogue', { i: 4 }), fresh: true }, RICH)).ok).toBe(true);
  });

  it('enforces a daily per-user allowance, with per-user overrides', async () => {
    // A request needs headroom for its input + 160 output tokens (~162); actual use (~8) is what is charged.
    // 165/day: the first fits, the second (8 used + 162 headroom) does not.
    const { ai, clock } = service({ allowance: { dailyTokens: 165, dailyCostMicros: 1_000_000 }, allowanceOverrides: { patron: { dailyTokens: 10_000 } } });
    let n = 0;
    const one = () => ai.request({ ...req('npc-dialogue', { n: n++ }), fresh: true }, RICH);
    expect((await one()).ok).toBe(true);
    const second = await one();
    expect(!second.ok && second.error.code).toBe('ALLOWANCE');
    expect((await ai.request(req('npc-dialogue', {}, 'patron'), RICH)).ok).toBe(true);
    expect(ai.remainingAllowance('u1').tokens).toBeLessThan(165);
    clock.advance(24 * 3600_000);
    expect((await one()).ok).toBe(true);
  });
});

describe('authored fallback and Chronicle prose', () => {
  const entries = [
    { summary: 'Arrived in Happy Fall', location: 'location_blackmere-square' },
    { summary: 'Bramble the russet hound came home with you', location: 'location_brindle-farm' },
    { summary: "Helped Tobias Quill: Apples for Quill's", location: 'location_blackmere-market' },
  ].map((e, i) => ({ id: `chron_${i}`, timestamp: i, event: 'x', participants: [], visibility: 'private', sourceSystem: 't', scopes: [], context: { realmId: 'r', serverId: 's', domain: 'PLAY' }, provenance: { origin: 'system', sourceSystem: 't', createdAt: 0 }, ...e }) as never);
  const names: Record<string, string> = { 'location_blackmere-square': 'Blackmere Town Square', 'location_brindle-farm': 'Brindle Farm Edge', 'location_blackmere-market': 'Blackmere Market' };

  it('deterministic prose retells entries without inventing anything', () => {
    const text = narrateDeterministic(entries, (id) => names[id]);
    expect(text).toBe(
      "First, arrived in Happy Fall (Blackmere Town Square). Then bramble the russet hound came home with you (Brindle Farm Edge). Most recently, helped Tobias Quill: Apples for Quill's (Blackmere Market).",
    );
    expect(narrateDeterministic(entries, (id) => names[id])).toBe(text);
  });

  it('on a MINIMAL server, narration uses the authored path and calls no model', async () => {
    const { ai, provider } = service();
    const r = await narrate(ai, { density: 'MINIMAL' }, 'u1', entries, (id) => names[id]);
    expect(r).toMatchObject({ source: 'authored', reason: 'DENSITY' });
    expect(provider.calls).toBe(0);
  });

  it('on a STANDARD server, narration may use a model', async () => {
    const ai = new AiService({ providers: [new OfflineProvider()], now: () => 0 });
    const r = await narrate(ai, { density: 'STANDARD' }, 'u1', entries, (id) => names[id]);
    expect(r.source).toBe('ai');
    expect(r.text).toContain('Arrived in Happy Fall');
  });
});
