import {
  WEEK_START_FALLBACK,
  YEAR_PAGE_SIZE,
  addDays,
  addMonths,
  addYears,
  clampIso,
  compareIso,
  dateOrderFor,
  daysInMonth,
  inRange,
  isLeapYear,
  isoInZone,
  monthGrid,
  navigate,
  parseIso,
  toIso,
  weekStartFor,
  weekStartFromInfo,
  weekdayOf,
  weekdayOrder,
  yearPage,
} from './calendar';

describe('leap years and month lengths', () => {
  it('follows the Gregorian rule, including the century exceptions', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('gives February 29 days only in a leap year', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('parseIso / toIso', () => {
  it('round-trips a real day', () => {
    expect(parseIso('2026-10-03')).toEqual({ y: 2026, m: 10, d: 3 });
    expect(toIso(2026, 3, 9)).toBe('2026-03-09');
  });

  it('accepts 29 February only in a leap year', () => {
    expect(parseIso('2024-02-29')).not.toBeNull();
    expect(parseIso('2026-02-29')).toBeNull();
  });

  it('rejects an impossible day, a malformed string and the empty string', () => {
    expect(parseIso('2026-02-31')).toBeNull();
    expect(parseIso('2026-13-01')).toBeNull();
    expect(parseIso('2026-1-1')).toBeNull();
    expect(parseIso('')).toBeNull();
  });
});

describe('addDays / addMonths / addYears', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('is exact across a daylight-saving change (days are not 24 hours of a local clock)', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('keeps the day when the next month has it', () => {
    expect(addMonths('2026-10-03', 1)).toBe('2026-11-03');
  });

  it('lands on the last day of a shorter month rather than skipping into the next', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('goes back across a year boundary', () => {
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
  });

  it('moves a leap day by a year to 28 February, and back to a leap year to 29', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
  });

  it('stays inside the four-digit years instead of overflowing', () => {
    expect(addDays('1000-01-01', -1)).toBe('1000-01-01');
    expect(addDays('9999-12-31', 1)).toBe('9999-12-31');
    expect(addYears('9999-06-01', 1)).toBe('9999-12-31');
  });

  it('refuses a value that is not a date rather than computing garbage', () => {
    expect(() => addDays('nope', 1)).toThrow();
  });
});

describe('weekday and ordering', () => {
  it('reports 0 for Sunday', () => {
    expect(weekdayOf('2026-10-04')).toBe(0);
    expect(weekdayOf('2026-10-03')).toBe(6);
  });

  it('compares and clamps ISO strings', () => {
    expect(compareIso('2026-01-01', '2026-12-31')).toBe(-1);
    expect(compareIso('2026-01-01', '2026-01-01')).toBe(0);
    expect(clampIso('2026-05-01', '2026-06-01', '2026-07-01')).toBe('2026-06-01');
    expect(clampIso('2026-09-01', '2026-06-01', '2026-07-01')).toBe('2026-07-01');
    expect(clampIso('2026-06-15', '2026-06-01', '2026-07-01')).toBe('2026-06-15');
    expect(clampIso('2026-06-15')).toBe('2026-06-15');
  });

  it('treats both bounds as inclusive', () => {
    expect(inRange('2026-06-01', '2026-06-01', '2026-06-30')).toBe(true);
    expect(inRange('2026-06-30', '2026-06-01', '2026-06-30')).toBe(true);
    expect(inRange('2026-07-01', '2026-06-01', '2026-06-30')).toBe(false);
  });

  it('starts a week on the given day', () => {
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayOrder(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
  });
});

describe('monthGrid', () => {
  it('is always six rows of seven', () => {
    for (const [y, m] of [
      [2026, 2],
      [2026, 10],
      [2021, 2],
      [2026, 8],
    ] as const) {
      const grid = monthGrid(y, m, 1);
      expect(grid).toHaveLength(6);
      expect(grid.every((row) => row.length === 7)).toBe(true);
    }
  });

  it('puts the first of the month under its weekday for a Monday start', () => {
    // 1 October 2026 is a Thursday: three leading days (Mon, Tue, Wed) from September.
    const grid = monthGrid(2026, 10, 1);
    expect(grid[0]!.slice(0, 3).map((c) => [c.iso, c.inMonth])).toEqual([
      ['2026-09-28', false],
      ['2026-09-29', false],
      ['2026-09-30', false],
    ]);
    expect(grid[0]![3]).toEqual({ iso: '2026-10-01', day: 1, inMonth: true });
  });

  it('shifts with a Sunday start', () => {
    const grid = monthGrid(2026, 10, 0);
    // Thursday is the fifth column when the week starts on Sunday.
    expect(grid[0]![4]).toEqual({ iso: '2026-10-01', day: 1, inMonth: true });
    expect(grid[0]![0]!.iso).toBe('2026-09-27');
  });

  it('starts on the first when it falls on the week start, with no leading days', () => {
    // 1 June 2026 is a Monday.
    const grid = monthGrid(2026, 6, 1);
    expect(grid[0]![0]).toEqual({ iso: '2026-06-01', day: 1, inMonth: true });
  });

  it('contains 29 February in a leap year and not otherwise', () => {
    const leap = monthGrid(2024, 2, 1)
      .flat()
      .filter((c) => c.inMonth);
    expect(leap).toHaveLength(29);
    const plain = monthGrid(2026, 2, 1)
      .flat()
      .filter((c) => c.inMonth);
    expect(plain).toHaveLength(28);
  });

  it('marks exactly the days of the month as in the month', () => {
    const inside = monthGrid(2026, 10, 1)
      .flat()
      .filter((c) => c.inMonth);
    expect(inside.map((c) => c.day)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });
});

describe('yearPage', () => {
  it('pages in twelves and contains the year asked for', () => {
    const page = yearPage(2026);
    expect(page).toHaveLength(YEAR_PAGE_SIZE);
    expect(page).toContain(2026);
    expect(page[0]).toBe(2016);
    expect(page[11]).toBe(2027);
  });

  it('does not run below the first four-digit year', () => {
    expect(yearPage(1000).every((y) => y >= 1000)).toBe(true);
  });
});

describe('navigate', () => {
  const base = { weekStart: 1 };

  it('moves by day and week with the arrows', () => {
    expect(navigate('2026-10-03', 'ArrowRight', base)).toBe('2026-10-04');
    expect(navigate('2026-10-03', 'ArrowLeft', base)).toBe('2026-10-02');
    expect(navigate('2026-10-03', 'ArrowDown', base)).toBe('2026-10-10');
    expect(navigate('2026-10-03', 'ArrowUp', base)).toBe('2026-09-26');
  });

  it('flips left and right in right-to-left, never up and down', () => {
    expect(navigate('2026-10-03', 'ArrowRight', { ...base, rtl: true })).toBe('2026-10-02');
    expect(navigate('2026-10-03', 'ArrowLeft', { ...base, rtl: true })).toBe('2026-10-04');
    expect(navigate('2026-10-03', 'ArrowDown', { ...base, rtl: true })).toBe('2026-10-10');
  });

  it('moves by month with PageUp and PageDown, landing on the month end when it is shorter', () => {
    expect(navigate('2026-10-31', 'PageDown', base)).toBe('2026-11-30');
    expect(navigate('2026-01-31', 'PageDown', base)).toBe('2026-02-28');
    expect(navigate('2026-03-15', 'PageUp', base)).toBe('2026-02-15');
  });

  it('moves by year with Shift', () => {
    expect(navigate('2026-10-03', 'PageDown', { ...base, shift: true })).toBe('2027-10-03');
    expect(navigate('2024-02-29', 'PageUp', { ...base, shift: true })).toBe('2023-02-28');
  });

  it('goes to the week edges with Home and End', () => {
    // 3 Oct 2026 is a Saturday. Monday-first week: Mon 28 Sep .. Sun 4 Oct.
    expect(navigate('2026-10-03', 'Home', base)).toBe('2026-09-28');
    expect(navigate('2026-10-03', 'End', base)).toBe('2026-10-04');
    // Sunday-first week: Sun 27 Sep .. Sat 3 Oct.
    expect(navigate('2026-10-03', 'Home', { weekStart: 0 })).toBe('2026-09-27');
    expect(navigate('2026-10-03', 'End', { weekStart: 0 })).toBe('2026-10-03');
  });

  it('stays on the edge when already there', () => {
    expect(navigate('2026-09-28', 'Home', base)).toBe('2026-09-28');
  });

  it('stays inside min and max', () => {
    const bounds = { ...base, min: '2026-10-01', max: '2026-10-31' };
    expect(navigate('2026-10-01', 'ArrowLeft', bounds)).toBe('2026-10-01');
    expect(navigate('2026-10-30', 'PageDown', bounds)).toBe('2026-10-31');
    expect(navigate('2026-10-15', 'PageUp', bounds)).toBe('2026-10-01');
  });

  it('returns null for a key that is not navigation', () => {
    expect(navigate('2026-10-03', 'a', base)).toBeNull();
    expect(navigate('2026-10-03', 'Enter', base)).toBeNull();
  });
});

describe('locale facts', () => {
  it('reads the week start from week info and falls back to Monday without it', () => {
    expect(weekStartFromInfo({ firstDay: 7 })).toBe(0);
    expect(weekStartFromInfo({ firstDay: 1 })).toBe(1);
    expect(weekStartFromInfo({ firstDay: 6 })).toBe(6);
    expect(weekStartFromInfo(undefined)).toBe(WEEK_START_FALLBACK);
    expect(weekStartFromInfo({ firstDay: 0 })).toBe(WEEK_START_FALLBACK);
  });

  it('returns a valid weekday for a real tag and the fallback for a broken one', () => {
    const real = weekStartFor('en-PK');
    expect(real).toBeGreaterThanOrEqual(0);
    expect(real).toBeLessThanOrEqual(6);
    expect(weekStartFor('not a locale!')).toBe(WEEK_START_FALLBACK);
  });

  it('reads numeric date order from the platform', () => {
    expect(dateOrderFor('en-PK')).toBe('dmy');
    expect(dateOrderFor('en-GB')).toBe('dmy');
    expect(dateOrderFor('en-US')).toBe('mdy');
    expect(dateOrderFor('ja-JP')).toBe('ymd');
    expect(dateOrderFor('not a locale!')).toBe('dmy');
  });

  it('names the calendar day in a zone, not the browser zone', () => {
    // 19:23 UTC on 6 Sep is already the 7th in Karachi (UTC+5).
    const instant = new Date('2026-09-06T19:23:00Z');
    expect(isoInZone(instant, 'Asia/Karachi', 'en-PK')).toBe('2026-09-07');
    expect(isoInZone(instant, 'UTC', 'en-PK')).toBe('2026-09-06');
  });

  it('returns Latin digits whatever the locale writes in', () => {
    const instant = new Date('2026-09-06T12:00:00Z');
    expect(isoInZone(instant, 'UTC', 'ur-PK')).toBe('2026-09-06');
  });
});
