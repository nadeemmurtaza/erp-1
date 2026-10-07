import { shopDayKey, shopLocalHour, startOfShopDay, startOfShopDaysAgo, type TimeZone } from '../../../core/time/shop-time';

/**
 * attendance-workforce/22-attendance-shifts-leave.md — "the working day is
 * not a date." A punch at 23:50 and its pair at 07:10 are one night shift,
 * not two, so the working day is computed from a policy cut-over hour, not
 * `date_trunc('day', occurredAt)`.
 *
 * Reuses `shopLocalHour`/`startOfShopDay`/`startOfShopDaysAgo` (core/time/
 * shop-time.ts) rather than re-deriving local-time/DST handling here — that
 * file already solves exactly this problem ("never label a day with
 * toISOString()", DST-safe day stepping) for the shop's own calendar day,
 * and a working day is the identical computation with a configurable
 * cut-over hour instead of midnight.
 *
 * Pure: no `prisma.` read, no `publish(` — so payroll's own preview (doc 25)
 * can replay a whole month of events with nothing written, and this file's
 * own specs can assert against fixed instants with no database.
 */

/**
 * The working day an instant belongs to, as `YYYY-MM-DD` in `timezone`.
 *
 * `cutoverHour` (0-23, a policy value — see
 * `SettingKey.AttendanceWorkingDayCutoverHour`) is the local hour at which a
 * new working day begins. An instant whose local hour is BEFORE the
 * cut-over belongs to the PREVIOUS calendar day's working day — so a
 * cut-over late enough to sit after a night shift's usual end time (e.g. 8
 * or 9) pulls an early-morning clock-out back onto the same working day as
 * the clock-in that preceded midnight.
 */
export function workingDayOf(occurredAt: Date, timezone: TimeZone, cutoverHour: number): string {
  const localHour = shopLocalHour(occurredAt, timezone);
  const dayStart = localHour < cutoverHour ? startOfShopDaysAgo(occurredAt, 2, timezone) : startOfShopDay(occurredAt, timezone);
  return shopDayKey(dayStart, timezone);
}

/**
 * Minutes elapsed between two instants — the only correct way to compute a
 * paid duration. Both `AttendanceEvent.occurredAt` values are true UTC
 * instants (the schema's own rule: "never a local wall-clock string"), so
 * this is a plain instant subtraction; it is deliberately NOT computed from
 * parsed local wall-clock strings, which is exactly the calculation a DST
 * transition breaks — see this file's own spec for the transition night
 * where that naive version would be off by an hour and this one is not.
 */
export function workedMinutesBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 60_000;
}
