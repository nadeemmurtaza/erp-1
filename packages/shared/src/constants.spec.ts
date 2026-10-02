import { formatBytes, formatDateTime, formatDateTimeSeconds, formatMoneyIn, formatMonthShort, formatWeekdayShort } from './constants';

describe('formatMoneyIn', () => {
  it('formats a minor-unit amount in an explicitly given currency, independent of BRAND.currency', () => {
    expect(formatMoneyIn(500000, 'usd')).toMatch(/5,000/);
    expect(formatMoneyIn(500000, 'usd')).toMatch(/\$/);
  });

  it('shows no decimal for a whole major-unit amount', () => {
    expect(formatMoneyIn(500000, 'usd')).not.toMatch(/\.00/);
  });

  it('shows a fractional amount when the minor units do not divide evenly', () => {
    expect(formatMoneyIn(500050, 'usd')).toMatch(/5,000\.5/);
  });
});

describe('formatBytes', () => {
  it('formats zero explicitly', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('scales through KB/MB/GB', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('accepts a bigint (a Postgres BigInt column read straight from Prisma)', () => {
    expect(formatBytes(BigInt(1024))).toBe('1 KB');
  });

  it('accepts the numeric string a BigInt serializes to over JSON (main.ts\'s own BigInt.prototype.toJSON)', () => {
    expect(formatBytes('1024')).toBe('1 KB');
  });

  it('never throws on a malformed value — returns the em dash placeholder instead', () => {
    expect(formatBytes('not-a-number')).toBe('—');
    expect(formatBytes(-5)).toBe('—');
  });
});

describe('formatMonthShort and formatWeekdayShort', () => {
  // 2026-03-02 is a Monday. Noon UTC is the same calendar day in the shop's zone
  // (UTC+5), so the date cannot slide across midnight.
  const monday = '2026-03-02T12:00:00Z';

  it('names the month alone', () => {
    expect(formatMonthShort(monday)).toBe('Mar');
  });

  it('names the weekday alone', () => {
    expect(formatWeekdayShort(monday)).toBe('Mon');
  });

  it('reads the shop-zone calendar day, not the UTC one', () => {
    // 22:00 UTC on the 31st is already 03:00 on 1 April in Karachi.
    expect(formatMonthShort('2026-03-31T22:00:00Z')).toBe('Apr');
  });
});

describe('formatDateTimeSeconds', () => {
  it('shows the second, which formatDateTime leaves out', () => {
    const instant = '2026-09-06T19:23:45Z';
    expect(formatDateTimeSeconds(instant, 'en', 'UTC')).toMatch(/12:23:45|7:23:45/);
    expect(formatDateTime(instant, 'en', 'UTC')).not.toMatch(/:45/);
  });

  it('reads the instant in the zone it is given, so two bids a second apart stay in order', () => {
    const first = formatDateTimeSeconds('2026-10-02T12:00:00Z', 'en', 'Asia/Karachi');
    const second = formatDateTimeSeconds('2026-10-02T12:00:01Z', 'en', 'Asia/Karachi');
    expect(first).toContain('5:00:00');
    expect(second).toContain('5:00:01');
  });
});
