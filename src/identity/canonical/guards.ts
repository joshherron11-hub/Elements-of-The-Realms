/**
 * Hard guardrails for anything derived from people's evidence.
 *
 * - No universal human score, no Universal Human Rank.
 * - No inference of job suitability or human worth.
 * These keys may not appear anywhere inside a derived/canonical payload.
 */
export const FORBIDDEN_DERIVED_KEYS: readonly string[] = [
  'score',
  'humanscore',
  'rank',
  'ranking',
  'universalrank',
  'rating',
  'worth',
  'humanworth',
  'suitability',
  'jobsuitability',
  'employability',
  'hireability',
  'iq',
  'percentile',
];

const normalise = (k: string) => k.toLowerCase().replace(/[^a-z]/g, '');

/** Returns the offending key paths, or [] if the object is clean. */
export function findForbiddenKeys(value: unknown, path = ''): string[] {
  if (value === null || typeof value !== 'object') return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if (FORBIDDEN_DERIVED_KEYS.includes(normalise(k))) out.push(p);
    out.push(...findForbiddenKeys(v, p));
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
