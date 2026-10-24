/**
 * Rolling a daily series up into week or month buckets — WO-B.5's
 * comparative chart, and anything after it that wants the same three
 * granularities.
 *
 * Deliberately built ON TOP of `shop-time.ts`'s day-granularity primitives
 * rather than teaching SQL a second, third and fourth `date_trunc` grain:
 * every query here still asks for one row per shop-local DAY (`shopDayExpr`,
 * `shopDayKeys` — already correct, already tested, already DST-safe), and
 * this file only sums those day rows into weeks or months in JavaScript.
 * That is also what makes "daily buckets sum to monthly buckets sum to
 * totals, to the paisa" true by construction rather than by hoping two
 * different SQL roundings agree.
 */
export type MetricBucket = 'day' | 'week' | 'month';

/** The Monday (ISO week start) containing the shop-local day named by `dayKey`, as its own `YYYY-MM-DD` key. */
export function weekKeyOf(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const isoDayOfWeek = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - isoDayOfWeek);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** The first day of the shop-local month containing `dayKey`, as its own `YYYY-MM-DD` key. */
export function monthKeyOf(dayKey: string): string {
  return `${dayKey.slice(0, 7)}-01`;
}

/** Which bucket a shop-local day key rolls up into, at the requested granularity. */
export function bucketKeyOf(dayKey: string, bucket: MetricBucket): string {
  if (bucket === 'day') return dayKey;
  if (bucket === 'week') return weekKeyOf(dayKey);
  return monthKeyOf(dayKey);
}

/**
 * Sums a day-keyed series into day/week/month buckets, oldest first.
 *
 * `dayKeys` is the full zero-filled axis (from `shopDayKeys`) so an entirely
 * empty day still contributes its zero to the bucket it falls in — the same
 * "never skip a value, never render a gap" guarantee `fillDays()` gives the
 * daily chart, carried through to week and month.
 */
export function rollUpDays<T extends Record<string, number>>(
  dayKeys: string[],
  valuesByDay: Map<string, T>,
  zero: T,
  bucket: MetricBucket,
): Array<{ t: string } & T> {
  const buckets = new Map<string, T>();

  for (const dayKey of dayKeys) {
    const key = bucketKeyOf(dayKey, bucket);
    const dayValue = valuesByDay.get(dayKey) ?? zero;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, dayValue);
      continue;
    }
    const merged = { ...zero };
    for (const field of Object.keys(zero) as (keyof T)[]) {
      merged[field] = ((existing[field] as number) + (dayValue[field] as number)) as T[keyof T];
    }
    buckets.set(key, merged);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, values]) => ({ t, ...values }));
}
