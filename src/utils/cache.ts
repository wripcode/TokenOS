// Simple in-memory LRU cache — no external deps

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class LRUCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 500, ttlMs = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    // Move to end (most-recently-used)
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    // Evict LRU entry if at capacity
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
