import { ageMovements, totalAgingBuckets } from './aging';

const day = (n: number) => new Date(2026, 0, n);
const ASOF = new Date(2026, 3, 1); // 2026-04-01

describe('ageMovements', () => {
  it('buckets a fully-unpaid origination by its own age', () => {
    const buckets = ageMovements([{ date: new Date(2026, 0, 1), amountMinor: 1000 }], ASOF);
    // Jan 1 -> Apr 1 is 90 days exactly.
    expect(buckets).toEqual({ current: 0, days31to60: 0, days61to90: 1000, over90: 0 });
    expect(totalAgingBuckets(buckets)).toBe(1000);
  });

  it('a settlement fully consumes an origination, leaving nothing to age', () => {
    const buckets = ageMovements(
      [
        { date: day(1), amountMinor: 1000 },
        { date: day(5), amountMinor: -1000 },
      ],
      ASOF,
    );
    expect(totalAgingBuckets(buckets)).toBe(0);
  });

  it('FIFO: a partial settlement consumes the oldest origination first', () => {
    const buckets = ageMovements(
      [
        { date: new Date(2026, 0, 1), amountMinor: 1000 }, // oldest — 90 days old at ASOF
        { date: new Date(2026, 2, 15), amountMinor: 500 }, // newest — 17 days old at ASOF
        { date: day(10), amountMinor: -1000 }, // settles the oldest one in full
      ],
      ASOF,
    );
    // Only the 500 from Mar 15 remains, and it is 17 days old -> "current".
    expect(buckets).toEqual({ current: 500, days31to60: 0, days61to90: 0, over90: 0 });
  });

  it('a settlement larger than any single origination spills into the next one', () => {
    const buckets = ageMovements(
      [
        { date: new Date(2026, 0, 1), amountMinor: 300 },
        { date: new Date(2026, 0, 2), amountMinor: 700 },
        { date: day(10), amountMinor: -500 }, // consumes the 300 fully, 200 of the second
      ],
      ASOF,
    );
    // Remaining 500 from the Jan 2 origination, ~89 days old.
    expect(totalAgingBuckets(buckets)).toBe(500);
    expect(buckets.days61to90).toBe(500);
  });

  it('places a 0-30 day balance in "current" and a 91+ day balance in "over90"', () => {
    const recent = ageMovements([{ date: new Date(2026, 2, 20), amountMinor: 100 }], ASOF); // 12 days
    const old = ageMovements([{ date: new Date(2025, 11, 1), amountMinor: 100 }], ASOF); // ~121 days

    expect(recent.current).toBe(100);
    expect(old.over90).toBe(100);
  });

  it('returns all-zero buckets for no movements', () => {
    expect(ageMovements([], ASOF)).toEqual({ current: 0, days31to60: 0, days61to90: 0, over90: 0 });
  });

  it('never lets settlements overpay into a negative remaining balance', () => {
    const buckets = ageMovements(
      [
        { date: day(1), amountMinor: 1000 },
        { date: day(5), amountMinor: -5000 }, // overpaid / advance
      ],
      ASOF,
    );
    expect(totalAgingBuckets(buckets)).toBe(0);
  });
});
