import type { ActorId } from '../core/refs';

/**
 * A directed relationship from one actor to another. Values describe how the
 * relationship stands in play; they are game state, not judgements of people.
 */
export interface Relationship {
  readonly from: ActorId;
  readonly to: ActorId;
  /** -100 (hostile) … +100 (warm). */
  regard: number;
  /** 0 … 100. */
  trust: number;
  /** 0 … 100, grows with contact. */
  familiarity: number;
  tags: string[];
  since: number;
  lastInteractionAt: number;
}

export const RELATIONSHIP_BOUNDS = {
  regard: [-100, 100],
  trust: [0, 100],
  familiarity: [0, 100],
} as const;
