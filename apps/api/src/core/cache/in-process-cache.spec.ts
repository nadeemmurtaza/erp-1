import { InProcessCache } from './in-process-cache';

/** 208-l1-l2-l3-caching-architecture.md §1 (WO-208.1) and its maxEntries acceptance (WO-208.5). */
describe('InProcessCache', () => {
  let now: number;
  const clock = () => now;

  beforeEach(() => {
    now = 1_000_000;
  });

  const cache = (maxEntries = 100, ttlMs = 30_000) => new InProcessCache<string, { n: number }>({ maxEntries, ttlMs, now: clock });

  describe('expiry', () => {
    it('serves an entry until ttlMs after it was set, then drops it', () => {
      const c = cache();
      c.set('a', { n: 1 });

      now += 29_999;
      expect(c.get('a')).toEqual({ n: 1 });

      now += 1;
      expect(c.get('a')).toBeUndefined();
      expect(c.size).toBe(0);
    });

    it('does not extend an entry when it is read — the SettingsService behaviour it replaces', () => {
      const c = cache();
      c.set('a', { n: 1 });

      for (let step = 0; step < 29; step += 1) {
        now += 1_000;
        expect(c.get('a')).toEqual({ n: 1 });
      }
      now += 1_000;
      expect(c.get('a')).toBeUndefined();
    });

    it('narrows an entry to a shorter lifetime, and never widens past its own TTL', () => {
      const c = cache();
      c.set('short', { n: 1 }, 3_000);
      c.set('long', { n: 2 }, 3_600_000);

      now += 3_000;
      expect(c.get('short')).toBeUndefined();
      expect(c.get('long')).toEqual({ n: 2 });

      now += 27_000;
      expect(c.get('long')).toBeUndefined();
    });

    it('stores nothing for a lifetime of zero or less, and drops what the key held before', () => {
      const c = cache();
      c.set('a', { n: 1 });

      c.set('a', { n: 2 }, 0);
      expect(c.get('a')).toBeUndefined();

      c.set('b', { n: 3 }, -5);
      c.set('c', { n: 4 }, Number.NaN);
      expect(c.size).toBe(0);
    });

    it('restarts the lifetime when a key is set again', () => {
      const c = cache();
      c.set('a', { n: 1 });
      now += 20_000;
      c.set('a', { n: 2 });

      now += 20_000;
      expect(c.get('a')).toEqual({ n: 2 });
    });
  });

  describe('invalidate', () => {
    it('drops one key, leaving the rest', () => {
      const c = cache();
      c.set('a', { n: 1 });
      c.set('b', { n: 2 });

      c.invalidate('a');

      expect(c.get('a')).toBeUndefined();
      expect(c.get('b')).toEqual({ n: 2 });
    });

    it('drops every key when called with none', () => {
      const c = cache();
      c.set('a', { n: 1 });
      c.set('b', { n: 2 });

      c.invalidate();

      expect(c.size).toBe(0);
    });

    it('is a no-op for a key it does not hold', () => {
      const c = cache();
      c.set('a', { n: 1 });
      c.invalidate('missing');
      expect(c.size).toBe(1);
    });
  });

  describe('maxEntries — bounded memory, least recently used first', () => {
    it('evicts the least recently set entry past the cap', () => {
      const c = cache(3);
      c.set('a', { n: 1 });
      c.set('b', { n: 2 });
      c.set('c', { n: 3 });
      c.set('d', { n: 4 });

      expect(c.size).toBe(3);
      expect(c.get('a')).toBeUndefined();
      expect(['b', 'c', 'd'].map((key) => c.get(key)?.n)).toEqual([2, 3, 4]);
    });

    it('counts a read as a use: a recently read entry outlives a recently set one', () => {
      const c = cache(3);
      c.set('a', { n: 1 });
      c.set('b', { n: 2 });
      c.set('c', { n: 3 });

      c.get('a');
      c.set('d', { n: 4 });

      expect(c.get('a')).toEqual({ n: 1 });
      expect(c.get('b')).toBeUndefined();
    });

    it('setting a key it already holds does not evict anything', () => {
      const c = cache(2);
      c.set('a', { n: 1 });
      c.set('b', { n: 2 });
      c.set('a', { n: 3 });

      expect(c.size).toBe(2);
      expect(c.get('b')).toEqual({ n: 2 });
    });

    it('never holds more than maxEntries under a synthetic load ten times its size (doc 208 acceptance)', () => {
      const maxEntries = 10_000;
      const c = cache(maxEntries);
      let largest = 0;

      for (let n = 0; n < maxEntries * 10; n += 1) {
        c.set(`user-${n}`, { n });
        largest = Math.max(largest, c.size);
        // A hot key read on every tenth request is never the least recently used.
        if (n % 10 === 0) c.get('user-0');
      }

      expect(largest).toBe(maxEntries);
      expect(c.size).toBe(maxEntries);
      expect(c.get('user-0')).toEqual({ n: 0 });
      expect(c.get(`user-${maxEntries * 10 - 1}`)).toEqual({ n: maxEntries * 10 - 1 });
      expect(c.get('user-1')).toBeUndefined();
    });
  });

  describe('options', () => {
    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses maxEntries %p', (maxEntries) => {
      expect(() => new InProcessCache({ maxEntries, ttlMs: 1_000 })).toThrow(RangeError);
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('refuses ttlMs %p', (ttlMs) => {
      expect(() => new InProcessCache({ maxEntries: 1, ttlMs })).toThrow(RangeError);
    });

    it('reads Date.now() when given no clock, at every call — so a test can move it', () => {
      const spy = jest.spyOn(Date, 'now').mockReturnValue(5_000);
      const c = new InProcessCache<string, { n: number }>({ maxEntries: 10, ttlMs: 1_000 });
      c.set('a', { n: 1 });

      spy.mockReturnValue(5_999);
      expect(c.get('a')).toEqual({ n: 1 });
      spy.mockReturnValue(6_000);
      expect(c.get('a')).toBeUndefined();
      spy.mockRestore();
    });
  });
});
