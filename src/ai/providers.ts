import type { AiProvider, AiRequest, Completion, ModelInfo } from './types';

/** Rough token estimate (≈ 4 characters per token). Good enough for budgeting. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/**
 * Offline provider: deterministic, free, no network. It stands in for a real
 * model in local development and tests, so every AI code path can run
 * without credentials. It composes text from the structured input.
 */
export class OfflineProvider implements AiProvider {
  readonly id = 'offline';
  readonly models: ModelInfo[] = [
    { id: 'offline-small', tier: 'small', costPerKIn: 0, costPerKOut: 0, maxOutputTokens: 1000 },
    { id: 'offline-medium', tier: 'medium', costPerKIn: 0, costPerKOut: 0, maxOutputTokens: 2000 },
    { id: 'offline-large', tier: 'large', costPerKIn: 0, costPerKOut: 0, maxOutputTokens: 4000 },
  ];

  available(): boolean {
    return true;
  }

  async complete(_model: ModelInfo, req: AiRequest): Promise<Completion> {
    const input = JSON.stringify(req.input);
    const lines = Object.values(req.input)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .filter((v): v is string => typeof v === 'string');
    const text = lines.length ? lines.join(' ') : `(${req.task})`;
    return { text, tokensIn: estimateTokens(input + (req.instruction ?? '')), tokensOut: estimateTokens(text) };
  }
}

/**
 * Scriptable provider for tests: fixed replies, configurable costs, optional
 * failure, and a call counter.
 */
export class ScriptedProvider implements AiProvider {
  calls = 0;
  constructor(
    readonly id: string,
    readonly models: ModelInfo[],
    private readonly reply: (req: AiRequest) => string = (r) => `reply to ${r.task}`,
    private readonly opts: { available?: boolean; fail?: boolean } = {},
  ) {}

  available(): boolean {
    return this.opts.available ?? true;
  }

  async complete(_model: ModelInfo, req: AiRequest): Promise<Completion> {
    this.calls++;
    if (this.opts.fail) throw new Error('provider unavailable');
    const text = this.reply(req);
    return { text, tokensIn: estimateTokens(JSON.stringify(req.input)), tokensOut: estimateTokens(text) };
  }
}

/**
 * REAL PROVIDERS — PLAN
 *
 * Anthropic (Claude) is the first real provider to support when production
 * AI is connected. The AiProvider abstraction stays: any other provider can
 * be added beside it without touching callers.
 *
 * Rules:
 *  - No API key is requested until a real model-backed feature needs one.
 *  - Keys never reach browser/client code. A real provider runs behind a
 *    server endpoint; the client-side AiProvider only calls that endpoint.
 *  - Default server AI density stays MINIMAL.
 */
export interface ProviderPlan {
  id: string;
  name: string;
  status: 'planned' | 'connected';
  /** Order in which providers will be supported. */
  order: number;
  serverSideOnly: true;
  note: string;
}

export const PROVIDER_PLAN: readonly ProviderPlan[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    status: 'planned',
    order: 1,
    serverSideOnly: true,
    note: 'First supported real provider. Connect behind a server endpoint when a model-backed feature needs it.',
  },
];
