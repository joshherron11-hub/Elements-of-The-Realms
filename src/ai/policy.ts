import { AI_DENSITIES, type AiDensity } from '../world/realm';
import type { AiTask, ModelTier } from './types';

/**
 * Which AI tasks a server's AI density allows, and which model tier each
 * task is routed to. MINIMAL (the default) permits only cheap retrieval;
 * everything else falls back to authored, deterministic content.
 */
export interface TaskPolicy {
  /** Lowest server AI density at which this task may call a model. */
  minDensity: AiDensity;
  tier: ModelTier;
  /** Default output budget. */
  maxOutputTokens: number;
  /** How long a cached answer stays valid. */
  cacheTtlMs: number;
}

export const TASK_POLICY: Record<AiTask, TaskPolicy> = {
  'semantic-search': { minDensity: 'MINIMAL', tier: 'small', maxOutputTokens: 200, cacheTtlMs: 24 * 3600_000 },
  'npc-dialogue': { minDensity: 'STANDARD', tier: 'small', maxOutputTokens: 160, cacheTtlMs: 3600_000 },
  'chronicle-prose': { minDensity: 'STANDARD', tier: 'medium', maxOutputTokens: 400, cacheTtlMs: 7 * 24 * 3600_000 },
  'world-summary': { minDensity: 'STANDARD', tier: 'medium', maxOutputTokens: 500, cacheTtlMs: 3600_000 },
  'education-assist': { minDensity: 'STANDARD', tier: 'medium', maxOutputTokens: 500, cacheTtlMs: 3600_000 },
  'creator-assist': { minDensity: 'STANDARD', tier: 'medium', maxOutputTokens: 800, cacheTtlMs: 0 },
  'rumor-synthesis': { minDensity: 'RICH', tier: 'small', maxOutputTokens: 200, cacheTtlMs: 6 * 3600_000 },
  'political-proposal': { minDensity: 'RICH', tier: 'large', maxOutputTokens: 700, cacheTtlMs: 0 },
  'agent-planning': { minDensity: 'CINEMATIC', tier: 'large', maxOutputTokens: 1000, cacheTtlMs: 0 },
};

export const densityAllows = (server: AiDensity, needed: AiDensity): boolean =>
  AI_DENSITIES.indexOf(server) >= AI_DENSITIES.indexOf(needed);
