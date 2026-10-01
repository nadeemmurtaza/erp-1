/**
 * Calendar arithmetic for the date field (MNU-2): a month's grid, a week's
 * start, keyboard movement by day, week, month and year, and the locale facts
 * the parser needs.
 *
 * A date here is always an ISO calendar day, "YYYY-MM-DD", never a `Date`
 * carried around. A calendar day has no time and no zone; passing a `Date`
 * invites the shop-versus-browser timezone bug that `SHOP_TIME_ZONE` exists to
 * stop. Arithmetic goes through UTC internally for the same reason (no daylight
 * saving hour can make a day 23 or 25 hours long), and nothing in this file
 * reads the clock: "today" is an argument.
 */

export type DateOrder = 'dmy' | 'mdy' | 'ymd';

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

/** The years a field will hold: four digits, so an ISO string always has a fixed shape. */
export const MIN_YEAR = 1000;
export const MAX_YEAR = 9999;
export const MIN_ISO = '1000-01-01';
export const MAX_ISO = '9999-12-31';

/**
 * Parameter: years on one page of the year grid. Exact value: 12.
 * A 3 by 4 grid: it fits a 264 px popover at 44 px rows, and a person jumping to
 * a birth year gets there in a handful of pages (forty clicks on a month arrow
 * is the failure MNU-2 names).
 */
export const YEAR_PAGE_SIZE = 12;

/**
 * Parameter: week start when the runtime cannot say. Exact value: 1 (Monday).
 * ISO 8601's own choice, and the one most of the world's locales share; used only
 * where `Intl.Locale#getWeekInfo` is missing (older Firefox).
 */
export const WEEK_START_FALLBACK = 1;

const pad = (n: number, width: number) => String(n).padStart(width, '0');

export function toIso(y: number, m: number, d: number): string {
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

/** Strict: `YYYY-MM-DD` and a day that exists. `2026-02-31` is not a date. */
export function parseIso(iso: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < MIN_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

/** A real date as a UTC timestamp's calendar day. */
function fromUtc(ms: number): string {
  const date = new Date(ms);
  const y = date.getUTCFullYear();
  // Compared as numbers: as strings, "10000-01-01" sorts before "9999-12-31".
  if (y < MIN_YEAR) return MIN_ISO;
  if (y > MAX_YEAR) return MAX_ISO;
  return toIso(y, date.getUTCMonth() + 1, date.getUTCDate());
}

const utcOf = ({ y, m, d }: Ymd) => Date.UTC(y, m - 1, d);

const DAY_MS = 86_400_000;

function must(iso: string): Ymd {
  const parsed = parseIso(iso);
  if (!parsed) throw new Error(`Not an ISO calendar day: ${iso}`);
  return parsed;
}

export function addDays(iso: string, days: number): string {
  return fromUtc(utcOf(must(iso)) + days * DAY_MS);
}

/**
 * Moves by whole months and keeps the day where it can. 31 January plus one
 * month is 28 (or 29) February, the last day of the month it lands in, not
 * 3 March: "a month later" never skips a month.
 */
export function addMonths(iso: string, months: number): string {
  const { y, m, d } = must(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (((total % 12) + 12) % 12) + 1;
  if (ny < MIN_YEAR) return MIN_ISO;
  if (ny > MAX_YEAR) return MAX_ISO;
  return toIso(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** 29 February plus a year is 28 February, for the same reason. */
export function addYears(iso: string, years: number): string {
  return addMonths(iso, years * 12);
}

/** 0 is Sunday, 6 is Saturday, as `Date#getUTCDay`. */
export function weekdayOf(iso: string): number {
  return new Date(utcOf(must(iso))).getUTCDay();
}

/** ISO days sort as strings, which is why they are fixed-width. */
export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function clampIso(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/** Whether `iso` falls inside the optional bounds, both inclusive. */
export function inRange(iso: string, min?: string, max?: string): boolean {
  return clampIso(iso, min, max) === iso;
}

export interface GridCell {
  iso: string;
  day: number;
  /** False for the leading and trailing days of the neighbouring months that fill the grid. */
  inMonth: boolean;
}

/**
 * The month as six rows of seven. Always six, so the popover is the same height
 * in February as in a month that spans six weeks, and nothing below it moves as
 * the reader pages. `weekStart` is 0 (Sunday) to 6.
 */
export function monthGrid(y: number, m: number, weekStart: number): GridCell[][] {
  const first = toIso(y, m, 1);
  const lead = (weekdayOf(first) - weekStart + 7) % 7;
  const rows: GridCell[][] = [];
  for (let row = 0; row < 6; row += 1) {
    const cells: GridCell[] = [];
    for (let col = 0; col < 7; col += 1) {
      const iso = addDays(first, row * 7 + col - lead);
      const parsed = must(iso);
      cells.push({ iso, day: parsed.d, inMonth: parsed.y === y && parsed.m === m });
    }
    rows.push(cells);
  }
  return rows;
}

/** The weekday numbers (0 Sunday) in the order a row runs, starting at `weekStart`. */
export function weekdayOrder(weekStart: number): number[] {
  return Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
}

/** The first year of the page of years that contains `year`. */
export function yearPageStart(year: number, size: number = YEAR_PAGE_SIZE): number {
  return Math.floor(year / size) * size;
}

export function yearPage(year: number, size: number = YEAR_PAGE_SIZE): number[] {
  const start = yearPageStart(year, size);
  return Array.from({ length: size }, (_, i) => start + i).filter((y) => y >= MIN_YEAR && y <= MAX_YEAR);
}

export interface NavigateOptions {
  weekStart: number;
  /** In right-to-left writing the arrow keys point the other way along a week. */
  rtl?: boolean;
  shift?: boolean;
  min?: string;
  max?: string;
}

/**
 * Where a key moves the focused day: arrows by day and week, PageUp and PageDown
 * by month, with Shift by year, Home and End to the week's edges. Stays inside
 * `min` and `max`, so the keyboard cannot land on a day that cannot be chosen.
 * Returns null for a key that is not navigation.
 */
export function navigate(
  iso: string,
  key: string,
  { weekStart, rtl = false, shift = false, min, max }: NavigateOptions,
): string | null {
  const offset = (weekdayOf(iso) - weekStart + 7) % 7;
  let next: string;
  switch (key) {
    case 'ArrowLeft':
      next = addDays(iso, rtl ? 1 : -1);
      break;
    case 'ArrowRight':
      next = addDays(iso, rtl ? -1 : 1);
      break;
    case 'ArrowUp':
      next = addDays(iso, -7);
      break;
    case 'ArrowDown':
      next = addDays(iso, 7);
      break;
    case 'PageUp':
      next = shift ? addYears(iso, -1) : addMonths(iso, -1);
      break;
    case 'PageDown':
      next = shift ? addYears(iso, 1) : addMonths(iso, 1);
      break;
    case 'Home':
      next = addDays(iso, -offset);
      break;
    case 'End':
      next = addDays(iso, 6 - offset);
      break;
    default:
      return null;
  }
  return clampIso(next, min, max);
}

/** Convert `getWeekInfo().firstDay` (1 Monday .. 7 Sunday) to 0 Sunday .. 6. */
export function weekStartFromInfo(info: { firstDay?: number } | null | undefined): number {
  const first = info?.firstDay;
  if (typeof first !== 'number' || first < 1 || first > 7) return WEEK_START_FALLBACK;
  return first % 7;
}

interface LocaleWithWeek extends Intl.Locale {
  getWeekInfo?: () => { firstDay: number };
  weekInfo?: { firstDay: number };
}

/** The first day of the week for a BCP 47 tag, from the platform's own locale data. */
export function weekStartFor(tag: string): number {
  try {
    const locale = new Intl.Locale(tag) as LocaleWithWeek;
    return weekStartFromInfo(typeof locale.getWeekInfo === 'function' ? locale.getWeekInfo() : locale.weekInfo);
  } catch {
    return WEEK_START_FALLBACK;
  }
}

/**
 * The order a locale writes a numeric date in, read from the platform rather
 * than a table of countries: a deployment in another country is a change to
 * `BRAND.locale.intlTags` and nothing here. The probe date has three different
 * numbers (2006, 11, 22) so each part is identifiable. Unknown tags read as
 * day first, the order most of the world uses.
 */
export function dateOrderFor(tag: string): DateOrder {
  try {
    const parts = new Intl.DateTimeFormat(tag, {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).formatToParts(new Date(Date.UTC(2006, 10, 22)));
    const order = parts
      .map((part) => (part.type === 'day' ? 'd' : part.type === 'month' ? 'm' : part.type === 'year' ? 'y' : ''))
      .join('');
    return order === 'mdy' || order === 'ymd' || order === 'dmy' ? order : 'dmy';
  } catch {
    return 'dmy';
  }
}

/**
 * The calendar day an instant falls on in `timeZone`, as ISO. Latin digits and
 * the Gregorian calendar are forced because the parts are read back as numbers;
 * an Urdu locale would otherwise return Arabic-Indic digits.
 */
export function isoInZone(instant: Date, timeZone: string, tag: string): string {
  const locale = new Intl.Locale(tag, { numberingSystem: 'latn', calendar: 'gregory' });
  const parts = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(instant);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return toIso(pick('year'), pick('month'), pick('day'));
}
