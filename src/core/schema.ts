/**
 * Minimal, dependency-free validation for authored JSON content (Realms,
 * server constitutions, modes). Collects every problem with its path so
 * content authors see all errors at once.
 */
export class Validator {
  readonly errors: string[] = [];

  constructor(private readonly root: string) {}

  private at(path: string): string {
    return path ? `${this.root}.${path}` : this.root;
  }

  fail(path: string, message: string): void {
    this.errors.push(`${this.at(path)}: ${message}`);
  }

  obj(v: unknown, path: string): Record<string, unknown> {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      this.fail(path, 'expected an object');
      return {};
    }
    return v as Record<string, unknown>;
  }

  str(v: unknown, path: string): string {
    if (typeof v !== 'string' || !v.trim()) {
      this.fail(path, 'expected a non-empty string');
      return '';
    }
    return v;
  }

  optStr(v: unknown, path: string): string | undefined {
    return v === undefined ? undefined : this.str(v, path);
  }

  bool(v: unknown, path: string): boolean {
    if (typeof v !== 'boolean') {
      this.fail(path, 'expected true or false');
      return false;
    }
    return v;
  }

  num(v: unknown, path: string, min = -Infinity, max = Infinity): number {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
      this.fail(path, `expected a number in [${min}, ${max}]`);
      return min === -Infinity ? 0 : min;
    }
    return v;
  }

  oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
      this.fail(path, `expected one of ${allowed.join(', ')}; got ${JSON.stringify(v)}`);
      return allowed[0]!;
    }
    return v as T;
  }

  arr<T>(v: unknown, path: string, item: (x: unknown, p: string) => T): T[] {
    if (!Array.isArray(v)) {
      this.fail(path, 'expected an array');
      return [];
    }
    return v.map((x, i) => item(x, `${path}[${i}]`));
  }

  /** Reject keys that are not part of the schema (catches typos in content). */
  noExtraKeys(o: Record<string, unknown>, allowed: readonly string[], path: string): void {
    for (const k of Object.keys(o)) if (!allowed.includes(k) && !k.startsWith('$')) this.fail(path ? `${path}.${k}` : k, 'unknown field');
  }

  get ok(): boolean {
    return this.errors.length === 0;
  }
}

/** Index of a value in an ordered scale, for "at most"/"at least" comparisons. */
export const rankOf = <T extends string>(scale: readonly T[], v: T): number => scale.indexOf(v);
