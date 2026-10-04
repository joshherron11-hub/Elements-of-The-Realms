/**
 * GUARDRAILS AGAINST UNIVERSAL HUMAN VALUE
 *
 * No universal human score. No overall human rank. No overall player
 * superiority. No Orientation quality or Element superiority. No
 * employability, education-worth or social-credit score.
 *
 * Contextual measurements ARE allowed when explicitly scoped — Tournament
 * Rank, Duel Rank, Creator Rank, War Rank, Scholar achievement, economic
 * performance, a specific skill — see `src/entities/measures.ts`. They must
 * never become a universal value of a person.
 */

/** Concepts that imply universal human value. Banned everywhere, including scoped measures. */
export const UNIVERSAL_VALUE_KEYS: readonly string[] = [
  'humanscore',
  'universalscore',
  'universalhumanscore',
  'overallscore',
  'overallrank',
  'overallhumanrank',
  'humanrank',
  'universalrank',
  'universalhumanrank',
  'superiority',
  'playersuperiority',
  'overallplayersuperiority',
  'orientationquality',
  'elementsuperiority',
  'employability',
  'employabilityscore',
  'hireability',
  'educationworth',
  'educationworthscore',
  'socialcredit',
  'socialcreditscore',
  'worth',
  'humanworth',
  'suitability',
  'jobsuitability',
  'iq',
];

/**
 * Bare scoring fields. Banned on Person, Identity and Canonical records,
 * where any score would read as a judgement of the person. (Scoped domain
 * measures live elsewhere and carry their context.)
 */
export const CANONICAL_RECORD_KEYS: readonly string[] = ['score', 'rank', 'ranking', 'rating', 'percentile', 'tier', 'grade', 'level'];

/** Kept for compatibility: everything banned on Canonical / identity records. */
export const FORBIDDEN_DERIVED_KEYS: readonly string[] = [...UNIVERSAL_VALUE_KEYS, ...CANONICAL_RECORD_KEYS];

const normalise = (k: string) => k.toLowerCase().replace(/[^a-z]/g, '');

/** True if a field or metric name implies universal human value. */
export const isUniversalValueName = (name: string): boolean => UNIVERSAL_VALUE_KEYS.includes(normalise(name));

/**
 * Returns the offending key paths, or [] if the object is clean.
 * `canonical` (default) also bans bare score/rank fields; `universal` bans
 * only universal-value concepts.
 */
export function findForbiddenKeys(value: unknown, mode: 'canonical' | 'universal' = 'canonical', path = ''): string[] {
  if (value === null || typeof value !== 'object') return [];
  const banned = mode === 'canonical' ? FORBIDDEN_DERIVED_KEYS : UNIVERSAL_VALUE_KEYS;
  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if (banned.includes(normalise(k))) out.push(p);
    out.push(...findForbiddenKeys(v, mode, p));
  }
  return out;
}

/**
 * Systems that belong to the economic loop. Their output may be *observed*
 * (a purchase is an interaction) but may never author a derived, Canonical
 * or Recognition record. Money buys opportunity, not Canonical truth.
 */
export const ECONOMIC_SOURCE_SYSTEMS: ReadonlySet<string> = new Set([
  'economy',
  'market',
  'property',
  'contracts',
  'ownership',
  'inventory',
  'familiars',
]);
