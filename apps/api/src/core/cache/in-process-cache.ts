export interface InProcessCacheOptions {
  /** Most entries held at once; past it, the least recently used is evicted. */
  maxEntries: number;
  /** How long an entry is served after it is set. A read never extends it. */
  ttlMs: number;
  /** The clock, in epoch ms. Tests pass their own; left out, it is Date.now(). */
  now?: () => number;
}

/**
 * L1 of 208-l1-l2-l3-caching-architecture.md: a bounded, expiring map held in
 * one API process. It is the Map SettingsService used to hand-roll, extracted
 * so every in-process cache here has one shape — `get()`, `set()`,
 * `invalidate(key?)` — instead of one copy of the idiom per service.
 *
 * - An entry is served until `ttlMs` after it was set, never longer: reading
 *   it does not extend it (the SettingsService behaviour this replaces).
 * - `maxEntries` bounds memory however many distinct keys callers present;
 *   past it the least recently used entry goes (the Map's insertion order is
 *   kept least-recently-used first by re-inserting on every hit).
 * - A miss and an expired entry are both `undefined`, which is why a value can
 *   never be `undefined` or `null`: a caller that must remember "nothing
 *   there" stores a box (SettingsService caches `{ value }`).
 *
 * One process only — another replica never sees these entries. Sharing is
 * TieredCache's L2 (tiered-cache.ts).
 */
export class InProcessCache<K extends NonNullable<unknown>, V extends NonNullable<unknown>> {
  private readonly entries = new Map<K, { value: V; expiresAt: number }>();
  private readonly now: () => number;

  constructor(private readonly options: InProcessCacheOptions) {
    if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries < 1) {
      throw new RangeError(`InProcessCache maxEntries must be a positive integer, got ${options.maxEntries}`);
    }
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
      throw new RangeError(`InProcessCache ttlMs must be a positive number of milliseconds, got ${options.ttlMs}`);
    }
    // Resolved on every call, not captured once, so a test's clock applies.
    this.now = options.now ?? (() => Date.now());
  }

  /** Entries currently held, expired ones not yet dropped included. */
  get size(): number {
    return this.entries.size;
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /**
   * Holds `value` for the cache's own TTL, or for `ttlMs` when that is
   * shorter — never longer, so a caller can narrow the window this cache was
   * built with (a value that stops being true sooner) but never widen it. A
   * lifetime of zero or less stores nothing, and still drops what the key
   * held before.
   */
  set(key: K, value: V, ttlMs: number = this.options.ttlMs): void {
    this.entries.delete(key);
    const lifetime = Math.min(ttlMs, this.options.ttlMs);
    if (!(lifetime > 0)) return;

    this.entries.set(key, { value, expiresAt: this.now() + lifetime });
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.options.maxEntries) break;
      this.entries.delete(oldest);
    }
  }

  /** Drops one key, or every key when called without one. */
  invalidate(key?: K): void {
    if (key === undefined) {
      this.entries.clear();
    } else {
      this.entries.delete(key);
    }
  }
}
