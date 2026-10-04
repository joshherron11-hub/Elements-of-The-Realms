import { err, ok, type Result } from '../core/result';
import type { OwnerRef } from '../core/refs';

/**
 * CONTEXTUAL MEASURES — scoped rankings and achievements.
 *
 * Allowed: Tournament Rank, Duel Rank, Creator Rank, War Rank, Scholar
 * achievement, economic performance, a specific skill's performance.
 * Every measure names the context it belongs to and means nothing outside
 * it. There is deliberately no way to express an unscoped, overall or
 * universal value of a person.
 *
 * Structure only: no system records measures yet.
 */
export const MEASURE_CONTEXT_KINDS = ['tournament', 'duel', 'creator', 'war', 'scholar', 'economic', 'skill', 'mode'] as const;
export type MeasureContextKind = (typeof MEASURE_CONTEXT_KINDS)[number];

export interface ContextualMeasure {
  readonly id: string;
  readonly subject: OwnerRef;
  /** The one context this measure is about, e.g. { kind: 'tournament', id: 'harvest-cup-1' }. */
  readonly context: { readonly kind: MeasureContextKind; readonly id: string };
  /** e.g. 'tournament-rank', 'duel-wins', 'apples-sold'. Never a universal concept. */
  readonly metric: string;
  readonly value: number;
  readonly at: number;
}

/** Words that would turn a scoped measure into a universal one. */
const UNIVERSALISING = /(overall|universal|global|human|person|lifetime-?worth|superior)/i;

export function validateMeasure(m: ContextualMeasure, isUniversalValueName: (name: string) => boolean): Result<true> {
  if (!(MEASURE_CONTEXT_KINDS as readonly string[]).includes(m.context?.kind)) return err('UNSCOPED_MEASURE', 'a measure must name its context kind');
  if (!m.context.id?.trim()) return err('UNSCOPED_MEASURE', 'a measure must name the specific context it belongs to');
  if (UNIVERSALISING.test(m.context.id)) return err('UNIVERSAL_MEASURE', `context "${m.context.id}" would make this a universal measure`);
  if (isUniversalValueName(m.metric) || UNIVERSALISING.test(m.metric)) return err('UNIVERSAL_MEASURE', `metric "${m.metric}" implies universal human value`);
  if (!Number.isFinite(m.value)) return err('BAD_VALUE', 'measure value must be a number');
  return ok(true);
}
