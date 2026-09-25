import {
  assertIanaTimeZone,
  shopDayExpr,
  shopDayKey,
  shopDayKeys,
  shopDaysBetween,
  shopLocalHour,
  startOfShopDay,
  startOfShopDaysAgo,
} from './shop-time';

const KARACHI = 'Asia/Karachi'; // UTC+5, no DST — the shop
const NEW_YORK = 'America/New_York'; // UTC-5/-4, DST — the other direction
const UTC = 'UTC';

describe('shopDayKey', () => {
  /**
   * The original bug. 2026-08-29 00:00 in Karachi is 2026-08-28 19:00 UTC, so
   * `toISOString().slice(0, 10)` called it the 28th and every day on the
   * dashboard chart was labelled one day early.
   */
  it('labels shop-local midnight as that local day, not the UTC day before', () => {
    const localMidnight = new Date('2026-08-28T19:00:00.000Z');

    expect(localMidnight.toISOString().slice(0, 10)).toBe('2026-08-28'); // the old, wrong answer
    expect(shopDayKey(localMidnight, KARACHI)).toBe('2026-08-29'); // the right one
  });

  it('labels the last millisecond of a shop day as that day', () => {
    // 2026-08-29 23:59:59.999 PKT
    expect(shopDayKey(new Date('2026-08-29T18:59:59.999Z'), KARACHI)).toBe('2026-08-29');
    // one millisecond later is the next shop day
    expect(shopDayKey(new Date('2026-08-29T19:00:00.000Z'), KARACHI)).toBe('2026-08-30');
  });

  it('works west of Greenwich, where the UTC day is ahead instead of behind', () => {
    // 2026-08-29 20:00 EDT is already 2026-08-30 UTC.
    const instant = new Date('2026-08-30T00:00:00.000Z');
    expect(instant.toISOString().slice(0, 10)).toBe('2026-08-30');
    expect(shopDayKey(instant, NEW_YORK)).toBe('2026-08-29');
  });

  it('agrees with toISOString when the shop is in UTC', () => {
    const instant = new Date('2026-08-29T13:45:00.000Z');
    expect(shopDayKey(instant, UTC)).toBe(instant.toISOString().slice(0, 10));
  });
});

describe('startOfShopDay', () => {
  it('returns the UTC instant of shop-local midnight', () => {
    const midday = new Date('2026-08-29T09:00:00.000Z'); // 14:00 PKT
    expect(startOfShopDay(midday, KARACHI).toISOString()).toBe('2026-08-28T19:00:00.000Z');
  });

  it('is idempotent', () => {
    const once = startOfShopDay(new Date('2026-08-29T09:00:00.000Z'), KARACHI);
    expect(startOfShopDay(once, KARACHI).toISOString()).toBe(once.toISOString());
  });

  it('lands on local midnight across a DST spring-forward', () => {
    // US DST began 2026-03-08. Local midnight that day is 05:00 UTC (still EST).
    const during = new Date('2026-03-08T18:00:00.000Z');
    const start = startOfShopDay(during, NEW_YORK);
    expect(shopDayKey(start, NEW_YORK)).toBe('2026-03-08');
    expect(new Intl.DateTimeFormat('en-GB', {
      timeZone: NEW_YORK, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(start)).toBe('00:00');
  });

  it('lands on local midnight across a DST fall-back', () => {
    const during = new Date('2026-11-01T18:00:00.000Z');
    const start = startOfShopDay(during, NEW_YORK);
    expect(shopDayKey(start, NEW_YORK)).toBe('2026-11-01');
    expect(new Intl.DateTimeFormat('en-GB', {
      timeZone: NEW_YORK, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(start)).toBe('00:00');
  });
});

describe('startOfShopDaysAgo', () => {
  it('spans exactly `days` local days, inclusive of today', () => {
    const now = new Date('2026-08-29T09:00:00.000Z');
    const start = startOfShopDaysAgo(now, 30, KARACHI);

    expect(shopDayKey(start, KARACHI)).toBe('2026-07-31');
    expect(shopDaysBetween(start, now, KARACHI)).toBe(30);
  });

  it('a 1-day window starts today', () => {
    const now = new Date('2026-08-29T09:00:00.000Z');
    expect(shopDayKey(startOfShopDaysAgo(now, 1, KARACHI), KARACHI)).toBe('2026-08-29');
  });

  it('steps by local days across a DST change, not by fixed 24h blocks', () => {
    const now = new Date('2026-03-10T16:00:00.000Z'); // 2026-03-10 EDT
    const start = startOfShopDaysAgo(now, 5, NEW_YORK);
    expect(shopDayKey(start, NEW_YORK)).toBe('2026-03-06');
    expect(shopDaysBetween(start, now, NEW_YORK)).toBe(5);
  });
});

describe('shopDayKeys', () => {
  it('produces a continuous, ordered axis ending on today', () => {
    const now = new Date('2026-08-29T09:00:00.000Z');
    const keys = shopDayKeys(startOfShopDaysAgo(now, 30, KARACHI), 30, KARACHI);

    expect(keys).toHaveLength(30);
    expect(keys[0]).toBe('2026-07-31');
    expect(keys.at(-1)).toBe('2026-08-29');
    expect(new Set(keys).size).toBe(30);
    expect([...keys].sort()).toEqual(keys);
  });

  /**
   * The regression guard. Late in the local evening, UTC has not yet rolled
   * over, so anything built on toISOString ends the axis on yesterday. This is
   * the case that was failing every day outside 00:00-05:00 PKT.
   */
  it('ends on today at 23:30 local, when UTC is still on the previous date', () => {
    const lateEvening = new Date('2026-08-29T18:30:00.000Z'); // 23:30 PKT
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-08-29');

    const keys = shopDayKeys(startOfShopDaysAgo(lateEvening, 30, KARACHI), 30, KARACHI);
    expect(keys.at(-1)).toBe(shopDayKey(lateEvening, KARACHI));
    expect(keys.at(-1)).toBe('2026-08-29');
  });

  it('rolls over month and year boundaries', () => {
    const newYearEve = new Date('2026-12-31T09:00:00.000Z');
    const keys = shopDayKeys(startOfShopDaysAgo(newYearEve, 3, KARACHI), 3, KARACHI);
    expect(keys).toEqual(['2026-12-29', '2026-12-30', '2026-12-31']);
  });
});

describe('shopDayExpr', () => {
  it('interprets the stored column as UTC before rendering it in the shop zone', () => {
    expect(shopDayExpr('"placedAt"', KARACHI)).toBe(
      `to_char(date_trunc('day', "placedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Karachi'), 'YYYY-MM-DD')`,
    );
  });

  it('refuses a zone carrying SQL, since the zone cannot be parameterised', () => {
    expect(() => shopDayExpr('"placedAt"', "UTC'; DROP TABLE \"Order\"; --")).toThrow(
      /Invalid timezone/,
    );
  });
});

describe('shopLocalHour', () => {
  it('reads the hour in the shop zone, not UTC', () => {
    // 2026-08-29 19:00 UTC is already 2026-08-30 00:00 in Karachi (UTC+5).
    expect(shopLocalHour(new Date('2026-08-29T19:00:00.000Z'), KARACHI)).toBe(0);
    expect(new Date('2026-08-29T19:00:00.000Z').getUTCHours()).toBe(19); // the wrong answer this guards against
  });

  it('works west of Greenwich, where the local hour is behind UTC', () => {
    // 2026-08-29 03:00 UTC is 2026-08-28 23:00 EDT (UTC-4).
    expect(shopLocalHour(new Date('2026-08-29T03:00:00.000Z'), NEW_YORK)).toBe(23);
  });

  it('never returns 24 for local midnight', () => {
    expect(shopLocalHour(new Date('2026-08-29T19:00:00.000Z'), KARACHI)).toBe(0);
  });
});

describe('assertIanaTimeZone', () => {
  it.each([KARACHI, NEW_YORK, UTC, 'Europe/London'])('accepts %s', (tz) => {
    expect(() => assertIanaTimeZone(tz)).not.toThrow();
  });

  it.each(["'; --", 'Not/AZone', 'Asia/Karachi; SELECT 1'])('rejects %s', (tz) => {
    expect(() => assertIanaTimeZone(tz)).toThrow();
  });
});
