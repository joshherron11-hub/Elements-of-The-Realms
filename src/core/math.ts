export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** True for a finite, safe, strictly positive integer. Used for all quantities and money. */
export const isPositiveInt = (n: number): boolean => Number.isSafeInteger(n) && n > 0;
