import type { AiDensity } from '../world/realm';
import type { JsonValue } from '../core/refs';

/**
 * AI SERVICE — TYPES
 *
 * AI is an optional interpretation layer. It never sits on the deterministic
 * path: movement, inventory math, timers, prices, ownership checks,
 * save/load and ordinary state changes are always plain code. AI output is
 * text for presentation (dialogue, prose, summaries, suggestions); it never
 * writes simulation state or Canonical records.
 */
export const AI_TASKS = [
  'npc-dialogue',
  'chronicle-prose',
  'rumor-synthesis',
  'world-summary',
  'political-proposal',
  'creator-assist',
  'semantic-search',
  'education-assist',
  'agent-planning',
] as const;
export type AiTask = (typeof AI_TASKS)[number];

/**
 * Work that must never be routed to a model. Requests naming these are
 * rejected outright — this list documents the rule in code.
 */
export const DETERMINISTIC_ONLY = [
  'movement',
  'inventory',
  'crop-timer',
  'merchant-arithmetic',
  'pricing',
  'property-check',
  'ownership-check',
  'save-load',
  'state-change',
  'canonical-derivation',
] as const;

export type ModelTier = 'small' | 'medium' | 'large';

export interface ModelInfo {
  readonly id: string;
  readonly tier: ModelTier;
  /** Cost in micro-units (millionths of the billing currency) per 1,000 tokens. */
  readonly costPerKIn: number;
  readonly costPerKOut: number;
  readonly maxOutputTokens: number;
}

export interface AiRequest {
  task: AiTask | (string & {});
  /** Who the request is on behalf of (allowance + rate limits). */
  userId: string;
  /** Structured input. Providers turn it into a prompt; the cache keys on it. */
  input: Record<string, JsonValue>;
  /** Free-text instruction, optional. */
  instruction?: string;
  maxOutputTokens?: number;
  /** Bypass the cache (e.g. "give me another"). */
  fresh?: boolean;
}

export interface Completion {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export interface AiProvider {
  readonly id: string;
  readonly models: readonly ModelInfo[];
  /** Whether this provider can serve requests right now (keys present, network reachable…). */
  available(): boolean;
  complete(model: ModelInfo, req: AiRequest): Promise<Completion>;
}

export interface AiResponse {
  text: string;
  task: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  cached: boolean;
}

export interface UsageRecord {
  at: number;
  userId: string;
  task: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  cached: boolean;
  outcome: 'ok' | 'denied' | 'error';
  reason?: string;
}

export interface AiContext {
  /** The server's AI density (from its constitution). */
  density: AiDensity;
}
