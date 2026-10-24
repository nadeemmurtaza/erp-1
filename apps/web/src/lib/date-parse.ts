import {
  MAX_YEAR,
  MIN_YEAR,
  addDays,
  addMonths,
  addYears,
  daysInMonth,
  parseIso,
  toIso,
  type DateOrder,
} from './calendar';

/**
 * Reads a date out of whatever a person typed (MNU-2, ACT-5: be liberal in what
 * you accept). `2026-10-03`, `3/10/2026`, `03-10-26`, `3 Oct`, `3rd October
 * 2026`, `Oct 3`, `today`, `+7d`, `-2w`, `+1m` all become one ISO day.
 *
 * Pure: "today" is an argument, never read from a clock, so the same input gives
 * the same answer in a test, a render and a replay. The caller supplies the
 * deployment's day order (day first or month first) from its locale; nothing
 * here knows which country it is in. Month names are English: the admin is
 * English-only by design, and a typed Urdu month name is a separate parser.
 *
 * A date it cannot use is refused with a reason that says what to type (FLO-7),
 * never just "invalid".
 */

export type ParseFailure = 'empty' | 'unrecognised' | 'impossible' | 'year' | 'before-min' | 'after-max';

export type ParseResult = { ok: true; iso: string } | { ok: false; reason: string; code: ParseFailure };

export interface ParseOptions {
  /** The current calendar day, ISO. Injected so this function reads no clock. */
  today: string;
  /** How the deployment writes a numeric date: `3/10/2026` is 3 October under `dmy`, 10 March under `mdy`. */
  order: DateOrder;
  min?: string;
  max?: string;
  /** How a date is written inside a reason. Defaults to ISO, which the field always accepts back. */
  format?: (iso: string) => string;
}

/**
 * Parameter: how far ahead a two-digit year may point. Exact value: 20 years.
 * "26" and "46" are 2026 and 2046; "47" is 1947. Chosen so a birth year typed as
 * "85" is 1985 and an expiry typed as "31" is 2031: the window is 80 years back
 * and 20 forward from today (the same window Java's SimpleDateFormat has used
 * for decades), and it slides with `today`, so it does not rot in 2050.
 */
export const TWO_DIGIT_YEAR_LOOKAHEAD = 20;

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A two-digit year in the window around `todayYear` (see `TWO_DIGIT_YEAR_LOOKAHEAD`). */
export function expandTwoDigitYear(yy: number, todayYear: number): number {
  const candidate = Math.floor(todayYear / 100) * 100 + yy;
  return candidate > todayYear + TWO_DIGIT_YEAR_LOOKAHEAD ? candidate - 100 : candidate;
}

/** "oct", "sept" and "october" are October; "ma" is nothing, because it could be March or May. */
function monthIndex(word: string): number {
  if (word.length < 3) return -1;
  return MONTHS.findIndex((name) => name.startsWith(word));
}

function numericExample(order: DateOrder): string {
  return order === 'mdy' ? '10/3/2026' : order === 'ymd' ? '2026-10-03' : '3/10/2026';
}

function unrecognised(raw: string, order: DateOrder): ParseResult {
  const shown = raw.length > 24 ? `${raw.slice(0, 24)}…` : raw;
  return {
    ok: false,
    code: 'unrecognised',
    reason: `Could not read “${shown}” as a date. Try ${numericExample(order)}, 3 Oct 2026, today or +7d.`,
  };
}

function yearFailure(): ParseResult {
  return { ok: false, code: 'year', reason: `Type a year from ${MIN_YEAR} to ${MAX_YEAR}, for example 2026.` };
}

/** Year text to a number: four digits are taken as written, one or two are expanded, three are refused. */
function resolveYear(text: string, todayYear: number): number | null {
  if (text.length === 4) return Number(text);
  if (text.length <= 2) return expandTwoDigitYear(Number(text), todayYear);
  return null;
}

/** Checks a y/m/d the text spelled out and builds the day, or says which part is wrong. */
function build(y: number, m: number, d: number): ParseResult {
  if (y < MIN_YEAR || y > MAX_YEAR) return yearFailure();
  if (m < 1 || m > 12) {
    return {
      ok: false,
      code: 'impossible',
      reason: 'There are 12 months. Type a month from 1 to 12, or its name, like Oct.',
    };
  }
  const last = daysInMonth(y, m);
  if (d < 1 || d > last) {
    return {
      ok: false,
      code: 'impossible',
      reason: `${titleCase(MONTHS[m - 1]!)} ${y} has ${last} days. Type a day from 1 to ${last}.`,
    };
  }
  return { ok: true, iso: toIso(y, m, d) };
}

/** Numeric day and month in the deployment's order; if the month cannot be a month but the day can, swap them. */
function orderDayMonth(a: number, b: number, order: DateOrder): { d: number; m: number } {
  const monthFirst = order === 'mdy' || order === 'ymd';
  let m = monthFirst ? a : b;
  let d = monthFirst ? b : a;
  if (m > 12 && d <= 12) [m, d] = [d, m];
  return { d, m };
}

/** The day an offset reaches, or null when a month or year offset leaves the supported years (a day offset cannot: four digits of weeks is under 200 years). */
function relative(sign: string, amount: number, unit: string, today: string): string | null {
  const n = sign === '-' ? -amount : amount;
  if (unit === 'd') return addDays(today, n);
  if (unit === 'w') return addDays(today, n * 7);
  const months = unit === 'y' ? n * 12 : n;
  const { y, m } = parseIso(today)!;
  const targetYear = Math.floor((y * 12 + (m - 1) + months) / 12);
  if (targetYear < MIN_YEAR || targetYear > MAX_YEAR) return null;
  return unit === 'm' ? addMonths(today, n) : addYears(today, n);
}

function readDate(text: string, raw: string, todayIso: string, order: DateOrder): ParseResult {
  const today = parseIso(todayIso)!;

  if (text === 'today') return { ok: true, iso: todayIso };
  if (text === 'tomorrow') return { ok: true, iso: addDays(todayIso, 1) };
  if (text === 'yesterday') return { ok: true, iso: addDays(todayIso, -1) };

  const rel = /^([+-])\s?(\d{1,4})\s?([dwmy])$/.exec(text);
  if (rel) {
    const iso = relative(rel[1]!, Number(rel[2]), rel[3]!, todayIso);
    return iso === null ? yearFailure() : { ok: true, iso };
  }

  // A full ISO timestamp is a date with a time after it: the date is what this field holds.
  const stamp = /^(\d{4}-\d{2}-\d{2})[t ]\d{1,2}:\d{2}/.exec(text);
  const input = stamp ? stamp[1]! : text;

  // Numeric: 2026-10-03, 3/10/2026, 03-10-26, 3.10.26, and day-month without a year (3/10).
  const three = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/.exec(input);
  if (three) {
    const [a, b, c] = [three[1]!, three[2]!, three[3]!];
    if (a.length === 4) return build(Number(a), Number(b), Number(c)); // year first is unambiguous
    if (a.length === 3 || c.length === 3) return yearFailure();
    if (order === 'ymd' && c.length < 4) {
      const y = resolveYear(a, today.y);
      return y === null ? yearFailure() : build(y, Number(b), Number(c));
    }
    const y = resolveYear(c, today.y);
    if (y === null) return yearFailure();
    // A four-digit year last under a year-first locale: read it day first, the world's default.
    const { d, m } = orderDayMonth(Number(a), Number(b), order === 'ymd' ? 'dmy' : order);
    return build(y, m, d);
  }
  const two = /^(\d{1,2})[/.-](\d{1,2})$/.exec(input);
  if (two) {
    const { d, m } = orderDayMonth(Number(two[1]), Number(two[2]), order);
    return build(today.y, m, d);
  }

  // Words: 3 Oct, 3rd October 2026, Oct 3, October 3rd, 2026, 3-Oct-2026, 3oct.
  const spaced = input
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/[,./-]/g, ' ')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = spaced.split(' ');
  const isNum = (t: string) => /^\d+$/.test(t);
  const monthAt = (t: string) => (isNum(t) ? -1 : monthIndex(t));

  let dayText: string | undefined;
  let month = -1;
  let yearText: string | undefined;

  if (tokens.length === 2 || tokens.length === 3) {
    const [t0, t1, t2] = tokens as [string, string, string | undefined];
    if (isNum(t0) && monthAt(t1) >= 0 && (t2 === undefined || isNum(t2))) {
      // 3 Oct [2026], or 2026 Oct 3 when the first number is a year and a third follows.
      if (t2 !== undefined && t0.length === 4) [yearText, month, dayText] = [t0, monthAt(t1), t2];
      else [dayText, month, yearText] = [t0, monthAt(t1), t2];
    } else if (monthAt(t0) >= 0 && isNum(t1) && (t2 === undefined || isNum(t2))) {
      // Oct 3 [2026]. "Oct 2026" has no day to read, and guessing the 1st would be a silent decision.
      if (t2 === undefined && t1.length > 2) {
        return {
          ok: false,
          code: 'unrecognised',
          reason: `Add the day: type 1 ${titleCase(MONTHS[monthAt(t0)]!)} ${t1}, or ${titleCase(MONTHS[monthAt(t0)]!.slice(0, 3))} 1 ${t1}.`,
        };
      }
      [month, dayText, yearText] = [monthAt(t0), t1, t2];
    }
  }
  if (dayText === undefined || month < 0) return unrecognised(raw, order);

  const y = yearText === undefined ? today.y : resolveYear(yearText, today.y);
  if (y === null) return yearFailure();
  return build(y, month + 1, Number(dayText));
}

/** The date the text means, or the reason it cannot be used. */
export function parseDateInput(
  text: string,
  { today, order, min, max, format = (iso) => iso }: ParseOptions,
): ParseResult {
  if (!parseIso(today)) throw new Error(`parseDateInput needs today as an ISO day, got "${today}"`);
  const raw = text.trim();
  if (!raw) {
    return {
      ok: false,
      code: 'empty',
      reason: `Type a date, like ${numericExample(order)}, 3 Oct 2026, today or +7d.`,
    };
  }

  const result = readDate(raw.toLowerCase().replace(/\s+/g, ' '), raw, today, order);
  if (!result.ok) return result;

  if (min && result.iso < min) {
    return {
      ok: false,
      code: 'before-min',
      reason: `The earliest date is ${format(min)}. Type that date or a later one.`,
    };
  }
  if (max && result.iso > max) {
    return {
      ok: false,
      code: 'after-max',
      reason: `The latest date is ${format(max)}. Type that date or an earlier one.`,
    };
  }
  return result;
}
