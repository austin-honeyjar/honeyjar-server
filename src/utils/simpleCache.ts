// Lightweight in-process cache with TTL (milliseconds)

export interface CacheEntry<T> {
  value: T;
  exp: number; // epoch ms
}

class SimpleCache {
  private store = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.exp) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number) {
    this.store.set(key, { value, exp: Date.now() + ttlMs });
  }

  del(key: string) {
    this.store.delete(key);
  }
}

export const simpleCache = new SimpleCache();
