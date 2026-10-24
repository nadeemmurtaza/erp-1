import { shopDayKeys } from './shop-time';
import { bucketKeyOf, monthKeyOf, rollUpDays, weekKeyOf } from './metric-window';

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
