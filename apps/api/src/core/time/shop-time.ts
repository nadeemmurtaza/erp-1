/**
 * Calendar days in the shop's timezone.
 *
 * "Today's revenue" means the shop's day, 00:00 to 23:59 where the shop is —
 * not the server's day and not UTC. Every `DateTime` column is stored as UTC in
 * a `timestamp without time zone`, so turning an instant into a day is a
 * conversion, and doing it in two different zones is how a sale made on the 29th
 * ends up reported on the 28th.
 *
 * Two rules, and the bug this file exists to prevent comes from breaking either:
 *
 *   1. **Never label a day with `toISOString()`.** That is UTC. Local midnight in
 *      UTC+5 is 19:00 UTC *the previous day*, so the label is a day early for
 *      every shop east of Greenwich.
 *   2. **Bucket and label in the same zone.** SQL's `date_trunc('day', col)` on a
 *      UTC-stored column buckets by UTC day. If the axis is built in shop time
 *      and the buckets in UTC, they disagree for the hours between the two
 *      midnights, and the disagreement moves with the time of day.
 *
 * Use `shopDayExpr()` for the SQL side and `shopDayKey()` for the axis, always
 * with the same `timeZone`.
 */

/** An IANA zone name, e.g. "Asia/Karachi". */
export type TimeZone = string;

/** en-CA formats as YYYY-MM-DD, which is the key format used throughout. */
function dayFormatter(timeZone: TimeZone): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * The shop-local calendar day an instant falls on, as `YYYY-MM-DD`.
 * This is the only correct way to label a day in this codebase.
 */
export function shopDayKey(instant: Date, timeZone: TimeZone): string {
  return dayFormatter(timeZone).format(instant);
}

/**
 * The shop-local hour (0-23) an instant falls in. Same reasoning as
 * `shopDayKey` — WO-9.4's "time of day" COD-risk signal has to read a
 * checkout's local hour, never the server's or UTC's, or a shop east of
 * Greenwich has every late-night order mislabelled as afternoon.
 */
export function shopLocalHour(instant: Date, timeZone: TimeZone): number {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(instant);
  // Some locales render midnight as "24" rather than "0".
  return Number(hour) % 24;
}

/** The shop-local date parts of an instant, as numbers. */
function shopDayParts(instant: Date, timeZone: TimeZone): { y: number; m: number; d: number } {
  const [y, m, d] = shopDayKey(instant, timeZone).split('-').map(Number);
  return { y, m, d };
}

/**
 * How far ahead of UTC the zone is at `instant`, in milliseconds.
 *
 * Read the instant's wall clock in the zone, reassemble those parts as if they
 * were UTC, and the difference from the real instant is the offset. This is the
 * only way to get it: JavaScript exposes no direct offset-for-zone-at-time API.
 */
function zoneOffsetMs(instant: Date, timeZone: TimeZone): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallClockAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24, // some locales render midnight as 24
    get('minute'),
    get('second'),
  );

  // Drop sub-second precision on both sides so the difference is a clean offset.
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The UTC instant of shop-local midnight on a given local calendar date.
 *
 * Subtracting the zone offset from the naive date gives a candidate; the offset
 * is then re-read *at that candidate* and applied again. The second pass is what
 * makes DST correct — on a transition day the offset before and after midnight
 * differ, and a single pass would land an hour out.
 */
function startOfShopDayFromParts(y: number, m: number, d: number, timeZone: TimeZone): Date {
  const naive = Date.UTC(y, m - 1, d);
  let instant = naive - zoneOffsetMs(new Date(naive), timeZone);
  instant = naive - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** The UTC instant of shop-local midnight on the day `instant` falls in. */
export function startOfShopDay(instant: Date, timeZone: TimeZone): Date {
  const { y, m, d } = shopDayParts(instant, timeZone);
  return startOfShopDayFromParts(y, m, d, timeZone);
}

/**
 * Shop-local midnight `days - 1` local days before the day `instant` falls in.
 *
 * Steps by calendar date rather than by subtracting 24-hour blocks, so a DST day
 * of 23 or 25 hours does not slide the window off its boundary.
 */
export function startOfShopDaysAgo(instant: Date, days: number, timeZone: TimeZone): Date {
  const { y, m, d } = shopDayParts(instant, timeZone);
  // Date.UTC normalises the underflow into the previous month or year.
  const shifted = new Date(Date.UTC(y, m - 1, d - (days - 1)));
  return startOfShopDayFromParts(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    timeZone,
  );
}

/** Parses a `YYYY-MM-DD` key into shop-local midnight, as a UTC instant. */
export function startOfShopDayFromKey(key: string, timeZone: TimeZone): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return new Date(NaN);
  const [, y, m, d] = match;
  return startOfShopDayFromParts(Number(y), Number(m), Number(d), timeZone);
}

/**
 * The last millisecond of the shop-local day named by a `YYYY-MM-DD` key.
 *
 * Derived as "the instant before the next day starts" rather than by setting
 * 23:59:59.999, so a DST day that is 23 or 25 hours long still ends exactly
 * where the next one begins.
 */
export function endOfShopDayFromKey(key: string, timeZone: TimeZone): Date {
  const start = startOfShopDayFromKey(key, timeZone);
  if (Number.isNaN(start.getTime())) return start;
  const { y, m, d } = shopDayParts(start, timeZone);
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStart = startOfShopDayFromParts(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    timeZone,
  );
  return new Date(nextStart.getTime() - 1);
}

/** The UTC instant of shop-local midnight on the 1st of `instant`'s local month. */
export function startOfShopMonth(instant: Date, timeZone: TimeZone): Date {
  const { y, m } = shopDayParts(instant, timeZone);
  return startOfShopDayFromParts(y, m, 1, timeZone);
}

/**
 * The list of `YYYY-MM-DD` keys from `start`'s local day forward, inclusive.
 * This is the chart's x-axis, and it must be built with the same zone the SQL
 * buckets with.
 */
export function shopDayKeys(start: Date, days: number, timeZone: TimeZone): string[] {
  const { y, m, d } = shopDayParts(start, timeZone);
  const keys: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    // Date.UTC normalises month and year rollover; the parts are then treated
    // as a local calendar date, never as an instant.
    const shifted = new Date(Date.UTC(y, m - 1, d + offset));
    keys.push(
      `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(
        shifted.getUTCDate(),
      ).padStart(2, '0')}`,
    );
  }
  return keys;
}

/** Inclusive count of shop-local days between two instants. */
export function shopDaysBetween(from: Date, to: Date, timeZone: TimeZone): number {
  const a = shopDayParts(from, timeZone);
  const b = shopDayParts(to, timeZone);
  return (
    Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000) + 1
  );
}

/**
 * SQL that buckets a UTC-stored `timestamp without time zone` by shop-local day
 * and returns it already formatted as `YYYY-MM-DD`.
 *
 * Returning a **string** rather than a timestamp is deliberate: a timestamp
 * would be re-interpreted by the driver on the way back into JavaScript, which
 * is a second chance to apply the wrong zone. A string cannot be misread.
 *
 * The column is interpreted as UTC first (`AT TIME ZONE 'UTC'` turns the naive
 * timestamp into a real instant) and then rendered in the shop's zone.
 *
 * `timeZone` is interpolated into the SQL, so it must never come from user
 * input — pass the value from settings, which `assertIanaTimeZone` validates.
 */
export function shopDayExpr(column: string, timeZone: TimeZone): string {
  assertIanaTimeZone(timeZone);
  return `to_char(date_trunc('day', ${column} AT TIME ZONE 'UTC' AT TIME ZONE '${timeZone}'), 'YYYY-MM-DD')`;
}

/**
 * Rejects anything that is not a zone this runtime knows.
 *
 * Also the injection guard for `shopDayExpr`, which cannot parameterise a zone
 * name: `AT TIME ZONE $1` is not valid where the zone must be a literal.
 */
export function assertIanaTimeZone(timeZone: string): void {
  if (!/^[A-Za-z][A-Za-z0-9+\-_]*(\/[A-Za-z0-9+\-_]+)*$/.test(timeZone)) {
    throw new Error(`Invalid timezone: ${timeZone}`);
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
  } catch {
    throw new Error(`Unknown timezone: ${timeZone}`);
  }
}
