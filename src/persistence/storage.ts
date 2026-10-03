/**
 * Storage adapters. Persistence talks to this interface only, so the same
 * save code can target browser localStorage today and a server or IndexedDB
 * later.
 */
export interface StorageAdapter {
  get(key: string): string | null;
  /** May throw (e.g. quota exceeded); callers turn that into a Result. */
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export class MemoryStorage implements StorageAdapter {
  private readonly data = new Map<string, string>();
  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.data.set(key, value);
  }
  remove(key: string): void {
    this.data.delete(key);
  }
  keys(): string[] {
    return [...this.data.keys()];
  }
}

/** Wraps window.localStorage (or any Web Storage). */
export class WebStorage implements StorageAdapter {
  constructor(private readonly store: Storage) {}
  get(key: string): string | null {
    return this.store.getItem(key);
  }
  set(key: string, value: string): void {
    this.store.setItem(key, value);
  }
  remove(key: string): void {
    this.store.removeItem(key);
  }
  keys(): string[] {
    return Array.from({ length: this.store.length }, (_, i) => this.store.key(i)).filter((k): k is string => k !== null);
  }
}
