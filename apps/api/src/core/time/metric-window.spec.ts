import { shopDayKeys, shopDaysBetween, startOfShopDayFromKey } from './shop-time';
import { bucketKeyOf, monthKeyOf, previousWindow, rollUpDays, weekKeyOf } from './metric-window';

describe('weekKeyOf', () => {
  it('rolls a day back to the Monday of its ISO week', () => {
    expect(weekKeyOf('2026-08-13')).toBe('2026-08-10'); // Thursday -> that week's Monday
    expect(weekKeyOf('2026-08-10')).toBe('2026-08-10'); // Monday -> itself
    expect(weekKeyOf('2026-08-09')).toBe('2026-08-03'); // Sunday -> the PRECEDING Monday
  });

  it('crosses a month boundary correctly', () => {
    expect(weekKeyOf('2026-09-01')).toBe('2026-08-31'); // Tuesday Sep 1 -> Monday Aug 31
  });
});

describe('monthKeyOf', () => {
  it("returns the month's first day", () => {
    expect(monthKeyOf('2026-08-29')).toBe('2026-08-01');
    expect(monthKeyOf('2026-01-01')).toBe('2026-01-01');
  });
});

describe('bucketKeyOf', () => {
  it('passes a day key through unchanged for the day bucket', () => {
    expect(bucketKeyOf('2026-08-13', 'day')).toBe('2026-08-13');
  });

  it('delegates to weekKeyOf/monthKeyOf for the other buckets', () => {
    expect(bucketKeyOf('2026-08-13', 'week')).toBe(weekKeyOf('2026-08-13'));
    expect(bucketKeyOf('2026-08-13', 'month')).toBe(monthKeyOf('2026-08-13'));
  });
});

describe('rollUpDays', () => {
  const ZERO = { sales: 0, expenses: 0 };

  it('passes a day-bucketed series through unchanged', () => {
    const days = ['2026-08-01', '2026-08-02'];
    const values = new Map([
      ['2026-08-01', { sales: 100, expenses: 10 }],
      ['2026-08-02', { sales: 200, expenses: 20 }],
    ]);

    expect(rollUpDays(days, values, ZERO, 'day')).toEqual([
      { t: '2026-08-01', sales: 100, expenses: 10 },
      { t: '2026-08-02', sales: 200, expenses: 20 },
    ]);
  });

  it('sums every day in a bucket, including days with no row at all', () => {
    const days = shopDayKeys(new Date('2026-08-01T00:00:00.000Z'), 5, 'UTC'); // Aug 1-5
    const values = new Map([
      ['2026-08-01', { sales: 100, expenses: 0 }],
      ['2026-08-03', { sales: 50, expenses: 5 }],
      // Aug 2, 4, 5 have no row — must contribute a true zero, not be skipped.
    ]);

    const result = rollUpDays(days, values, ZERO, 'month');
    expect(result).toEqual([{ t: '2026-08-01', sales: 150, expenses: 5 }]);
  });

  it('never loses or double-counts a paisa: bucket sums equal the sum of every day', () => {
    const days = shopDayKeys(new Date('2026-07-20T00:00:00.000Z'), 20, 'UTC'); // spans Jul->Aug
    const values = new Map(days.map((day, i) => [day, { sales: (i + 1) * 137, expenses: (i + 1) * 11 }]));

    const total = (bucket: 'day' | 'week' | 'month') =>
      rollUpDays(days, values, ZERO, bucket).reduce(
        (sum, b) => ({ sales: sum.sales + b.sales, expenses: sum.expenses + b.expenses }),
        { sales: 0, expenses: 0 },
      );

    const dayTotal = total('day');
    expect(total('week')).toEqual(dayTotal);
    expect(total('month')).toEqual(dayTotal);
  });

  it('sorts buckets ascending, oldest first', () => {
    const days = shopDayKeys(new Date('2026-01-15T00:00:00.000Z'), 60, 'UTC');
    const values = new Map<string, { sales: number; expenses: number }>();

    const months = rollUpDays(days, values, ZERO, 'month').map((b) => b.t);
    expect(months).toEqual([...months].sort());
  });
});

describe('previousWindow', () => {
  /** Inclusive shop-local day count spanned by a half-open `[from, to)` window. */
  function dayCount(from: Date, to: Date, timeZone: string): number {
    return shopDaysBetween(from, new Date(to.getTime() - 1), timeZone);
  }

  it('touches the current window with no gap: prevTo equals from', () => {
    const from = startOfShopDayFromKey('2026-08-01', 'UTC');
    const to = startOfShopDayFromKey('2026-08-31', 'UTC'); // 30-day window
    const { prevTo } = previousWindow(from, to, 'UTC');
    expect(prevTo.getTime()).toBe(from.getTime());
  });

  it('gives the previous window the same day count as the current one, with no overlap', () => {
    const from = startOfShopDayFromKey('2026-08-01', 'UTC');
    const to = startOfShopDayFromKey('2026-08-31', 'UTC'); // 30 shop-local days
    const { prevFrom, prevTo } = previousWindow(from, to, 'UTC');

    expect(dayCount(prevFrom, prevTo, 'UTC')).toBe(dayCount(from, to, 'UTC'));
    // No overlap: the previous window's last included day is strictly before `from`.
    expect(prevTo.getTime()).toBeLessThanOrEqual(from.getTime());
    expect(prevFrom.getTime()).toBeLessThan(from.getTime());
  });

  it('crosses a month boundary correctly', () => {
    // Window: Jan 25 .. Feb 5 inclusive (12 shop-local days).
    const from = startOfShopDayFromKey('2026-01-25', 'UTC');
    const to = startOfShopDayFromKey('2026-02-06', 'UTC');

    const { prevFrom, prevTo } = previousWindow(from, to, 'UTC');

    expect(prevTo.getTime()).toBe(from.getTime());
    expect(prevFrom.getTime()).toBe(startOfShopDayFromKey('2026-01-13', 'UTC').getTime());
    expect(dayCount(prevFrom, prevTo, 'UTC')).toBe(12);
  });

  it('crosses a leap day correctly (2028 is a leap year)', () => {
    // Window: Feb 20 .. Mar 1 inclusive (11 shop-local days, including Feb 29).
    const from = startOfShopDayFromKey('2028-02-20', 'UTC');
    const to = startOfShopDayFromKey('2028-03-02', 'UTC');

    const { prevFrom, prevTo } = previousWindow(from, to, 'UTC');

    expect(prevTo.getTime()).toBe(from.getTime());
    expect(prevFrom.getTime()).toBe(startOfShopDayFromKey('2028-02-09', 'UTC').getTime());
    expect(dayCount(prevFrom, prevTo, 'UTC')).toBe(11);
  });

  it('keeps the day count equal across a spring-forward DST transition', () => {
    // America/New_York springs forward on 2026-03-08.
    const timeZone = 'America/New_York';
    const from = startOfShopDayFromKey('2026-03-01', timeZone);
    const to = startOfShopDayFromKey('2026-03-15', timeZone); // 14 days, straddling the transition

    const { prevFrom, prevTo } = previousWindow(from, to, timeZone);

    expect(prevTo.getTime()).toBe(from.getTime());
    expect(dayCount(prevFrom, prevTo, timeZone)).toBe(dayCount(from, to, timeZone));
  });

  it('keeps the day count equal across a fall-back DST transition', () => {
    // America/New_York falls back on 2026-11-01.
    const timeZone = 'America/New_York';
    const from = startOfShopDayFromKey('2026-10-25', timeZone);
    const to = startOfShopDayFromKey('2026-11-08', timeZone); // 14 days, straddling the transition

    const { prevFrom, prevTo } = previousWindow(from, to, timeZone);

    expect(prevTo.getTime()).toBe(from.getTime());
    expect(dayCount(prevFrom, prevTo, timeZone)).toBe(dayCount(from, to, timeZone));
  });

  it('handles a "to" of right now, mid-day (not a clean midnight)', () => {
    const timeZone = 'UTC';
    const from = startOfShopDayFromKey('2026-08-01', timeZone);
    const to = new Date('2026-08-15T13:45:00.000Z'); // partial day 15 (Aug 1..Aug 15 inclusive = 15 days)

    const { prevFrom, prevTo } = previousWindow(from, to, timeZone);

    expect(prevTo.getTime()).toBe(from.getTime());
    expect(dayCount(prevFrom, prevTo, timeZone)).toBe(15);
    expect(prevFrom.getTime()).toBe(startOfShopDayFromKey('2026-07-17', timeZone).getTime());
  });

  it('treats a single-day window (to one millisecond after from) as a 1-day window', () => {
    const timeZone = 'UTC';
    const from = startOfShopDayFromKey('2026-08-01', timeZone);
    const to = new Date(from.getTime() + 1);

    const { prevFrom, prevTo } = previousWindow(from, to, timeZone);

    expect(prevTo.getTime()).toBe(from.getTime());
    expect(prevFrom.getTime()).toBe(startOfShopDayFromKey('2026-07-31', timeZone).getTime());
  });

  it('never lets `to` at or before `from` produce a window ending after it starts', () => {
    const timeZone = 'UTC';
    const from = startOfShopDayFromKey('2026-08-01', timeZone);
    const to = from; // degenerate: zero-length window

    const { prevFrom, prevTo } = previousWindow(from, to, timeZone);

    expect(prevTo.getTime()).toBe(from.getTime());
    expect(prevFrom.getTime()).toBeLessThanOrEqual(prevTo.getTime());
  });
});
