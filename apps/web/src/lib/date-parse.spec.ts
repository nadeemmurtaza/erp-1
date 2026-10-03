import { TWO_DIGIT_YEAR_LOOKAHEAD, expandTwoDigitYear, parseDateInput, type ParseOptions } from './date-parse';

const TODAY = '2026-10-01';
const dmy: ParseOptions = { today: TODAY, order: 'dmy' };
const mdy: ParseOptions = { today: TODAY, order: 'mdy' };
const ymd: ParseOptions = { today: TODAY, order: 'ymd' };

const iso = (text: string, options: ParseOptions = dmy) => {
  const result = parseDateInput(text, options);
  return result.ok ? result.iso : `FAIL:${result.code}`;
};

describe('the formats the field must understand (MNU-2)', () => {
  it.each([
    ['2026-10-03', '2026-10-03'],
    ['2026/10/03', '2026-10-03'],
    ['2026-1-3', '2026-01-03'],
    ['3/10/2026', '2026-10-03'],
    ['03-10-26', '2026-10-03'],
    ['3.10.2026', '2026-10-03'],
    ['3 Oct', '2026-10-03'],
    ['3 Oct 2026', '2026-10-03'],
    ['3oct', '2026-10-03'],
    ['3-Oct-2026', '2026-10-03'],
    ['Oct 3', '2026-10-03'],
    ['oct 3 2026', '2026-10-03'],
    ['Oct 3, 2026', '2026-10-03'],
    ['October 3rd 2026', '2026-10-03'],
    ['3rd of oct', 'FAIL:unrecognised'],
    ['2nd Sept 2026', '2026-09-02'],
    ['2026 Oct 3', '2026-10-03'],
    ['  3   OCT   2026  ', '2026-10-03'],
    ['2026-10-03T14:30:00Z', '2026-10-03'],
  ])('reads %s as %s', (text, expected) => {
    expect(iso(text)).toBe(expected);
  });

  it('reads the keywords against the injected today', () => {
    expect(iso('today')).toBe('2026-10-01');
    expect(iso('Tomorrow')).toBe('2026-10-02');
    expect(iso('yesterday')).toBe('2026-09-30');
  });

  it('reads relative offsets in days, weeks, months and years', () => {
    expect(iso('+7d')).toBe('2026-10-08');
    expect(iso('-2w')).toBe('2026-09-17');
    expect(iso('+1m')).toBe('2026-11-01');
    expect(iso('-1y')).toBe('2025-10-01');
    expect(iso('+ 3 d')).toBe('2026-10-04');
    expect(iso('+0d')).toBe('2026-10-01');
  });

  it('is pure: the same text and today always give the same day, and today moves the answer', () => {
    expect(iso('tomorrow')).toBe(iso('tomorrow'));
    expect(iso('tomorrow', { ...dmy, today: '2027-02-28' })).toBe('2027-03-01');
  });
});

describe('day order follows the deployment locale', () => {
  it('reads 3/10/2026 as 3 October day first and 10 March month first', () => {
    expect(iso('3/10/2026', dmy)).toBe('2026-10-03');
    expect(iso('3/10/2026', mdy)).toBe('2026-03-10');
  });

  it('applies to the two-part form too', () => {
    expect(iso('3/10', dmy)).toBe('2026-10-03');
    expect(iso('3/10', mdy)).toBe('2026-03-10');
  });

  it('reads year first without ambiguity under any order', () => {
    expect(iso('2026-03-10', dmy)).toBe('2026-03-10');
    expect(iso('2026-03-10', mdy)).toBe('2026-03-10');
  });

  it('under a year-first locale reads yy-mm-dd, and a four-digit year last as day first', () => {
    expect(iso('26-10-03', ymd)).toBe('2026-10-03');
    expect(iso('3/10/2026', ymd)).toBe('2026-10-03');
  });

  it('swaps when the typed order is impossible and the other is not (Postel)', () => {
    expect(iso('10/13/2026', dmy)).toBe('2026-10-13');
    expect(iso('13/10/2026', mdy)).toBe('2026-10-13');
  });

  it('does not swap when neither reading works', () => {
    expect(iso('13/13/2026', dmy)).toBe('FAIL:impossible');
  });
});

describe('impossible dates say what to type', () => {
  it('rejects 31 February and names the month length', () => {
    const result = parseDateInput('31 Feb', dmy);
    expect(result).toEqual({
      ok: false,
      code: 'impossible',
      reason: 'February 2026 has 28 days. Type a day from 1 to 28.',
    });
  });

  it('rejects 30 February in a leap year with the leap length', () => {
    const result = parseDateInput('30/2/2024', dmy);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('February 2024 has 29 days. Type a day from 1 to 29.');
  });

  it('accepts 29 February only in a leap year', () => {
    expect(iso('29 Feb 2024')).toBe('2024-02-29');
    expect(iso('29 Feb 2026')).toBe('FAIL:impossible');
    expect(iso('29/2/00')).toBe('2000-02-29');
    expect(iso('29/2/1900')).toBe('FAIL:impossible');
  });

  it('rejects day zero and day 32', () => {
    expect(iso('0 Oct')).toBe('FAIL:impossible');
    expect(iso('32 Oct')).toBe('FAIL:impossible');
    expect(iso('2026-04-31')).toBe('FAIL:impossible');
  });

  it('rejects month 13 and 0, telling the reader the months run 1 to 12', () => {
    const result = parseDateInput('2026-13-01', dmy);
    expect(!result.ok && result.reason).toMatch(/1 to 12/);
    expect(iso('2026-00-10')).toBe('FAIL:impossible');
  });
});

describe('month-end and leap-day arithmetic', () => {
  it('+1m from 31 January lands on the last day of February, not March', () => {
    expect(iso('+1m', { ...dmy, today: '2026-01-31' })).toBe('2026-02-28');
    expect(iso('+1m', { ...dmy, today: '2024-01-31' })).toBe('2024-02-29');
  });

  it('+1y from a leap day lands on 28 February', () => {
    expect(iso('+1y', { ...dmy, today: '2024-02-29' })).toBe('2025-02-28');
  });

  it('crosses a year end by days and by months', () => {
    expect(iso('+7d', { ...dmy, today: '2026-12-28' })).toBe('2027-01-04');
    expect(iso('+2m', { ...dmy, today: '2026-12-15' })).toBe('2027-02-15');
  });

  it('refuses an offset that leaves the supported years', () => {
    expect(iso('+9999y')).toBe('FAIL:year');
    expect(iso('-9999y')).toBe('FAIL:year');
  });
});

describe('two-digit years', () => {
  it('uses the window 80 years back and 20 forward from today', () => {
    expect(TWO_DIGIT_YEAR_LOOKAHEAD).toBe(20);
    expect(expandTwoDigitYear(26, 2026)).toBe(2026);
    expect(expandTwoDigitYear(46, 2026)).toBe(2046);
    expect(expandTwoDigitYear(47, 2026)).toBe(1947);
    expect(expandTwoDigitYear(85, 2026)).toBe(1985);
    expect(expandTwoDigitYear(0, 2026)).toBe(2000);
  });

  it('slides with today instead of being fixed', () => {
    expect(expandTwoDigitYear(70, 2060)).toBe(2070);
    expect(expandTwoDigitYear(90, 2060)).toBe(2090 - 100);
  });

  it('applies in numeric and word forms', () => {
    expect(iso('03-10-26')).toBe('2026-10-03');
    expect(iso('3/10/85')).toBe('1985-10-03');
    expect(iso('3 Oct 85')).toBe('1985-10-03');
    expect(iso('3/10/5')).toBe('2005-10-03');
  });

  it('refuses a three-digit year, which no one means', () => {
    expect(iso('3/10/202')).toBe('FAIL:year');
    expect(iso('3 Oct 202')).toBe('FAIL:year');
  });

  it('refuses a four-digit year below 1000', () => {
    expect(iso('0099-01-01')).toBe('FAIL:year');
  });
});

describe('min and max (a reason, never a silent clamp)', () => {
  const bounded: ParseOptions = { ...dmy, min: '2026-10-05', max: '2026-10-20' };

  it('accepts both bounds themselves', () => {
    expect(iso('2026-10-05', bounded)).toBe('2026-10-05');
    expect(iso('2026-10-20', bounded)).toBe('2026-10-20');
  });

  it('refuses a day before min and says the earliest date', () => {
    const result = parseDateInput('2026-10-04', bounded);
    expect(result).toEqual({
      ok: false,
      code: 'before-min',
      reason: 'The earliest date is 2026-10-05. Type that date or a later one.',
    });
  });

  it('refuses a day after max and says the latest date', () => {
    const result = parseDateInput('21 Oct', bounded);
    expect(!result.ok && result.code).toBe('after-max');
    expect(!result.ok && result.reason).toMatch(/latest date is 2026-10-20/);
  });

  it('applies to keywords and offsets too', () => {
    expect(iso('yesterday', bounded)).toBe('FAIL:before-min');
    expect(iso('+30d', bounded)).toBe('FAIL:after-max');
    expect(iso('+10d', bounded)).toBe('2026-10-11');
  });

  it('writes the bound with the caller formatter, so it reads in the locale', () => {
    const result = parseDateInput('2026-10-04', { ...bounded, format: (d) => `<${d}>` });
    expect(!result.ok && result.reason).toContain('<2026-10-05>');
  });

  it('works with only one bound', () => {
    expect(iso('2026-01-01', { ...dmy, min: '2026-06-01' })).toBe('FAIL:before-min');
    expect(iso('2030-01-01', { ...dmy, min: '2026-06-01' })).toBe('2030-01-01');
  });
});

describe('text it cannot read', () => {
  it('says empty for nothing, with an example to type', () => {
    const result = parseDateInput('   ', dmy);
    expect(!result.ok && result.code).toBe('empty');
    expect(!result.ok && result.reason).toMatch(/3\/10\/2026/);
  });

  it('gives an example in the locale order', () => {
    const result = parseDateInput('banana', mdy);
    expect(!result.ok && result.reason).toMatch(/10\/3\/2026/);
    const iso8601 = parseDateInput('banana', ymd);
    expect(!result.ok && !iso8601.ok && iso8601.reason).toMatch(/2026-10-03/);
  });

  it('truncates a long junk string in the message', () => {
    const result = parseDateInput('x'.repeat(80), dmy);
    expect(!result.ok && result.reason.length).toBeLessThan(140);
  });

  it.each(['abc', '12', '2026', 'Oct', 'oct oct', '3 3', '+d', '++1d', 'next week', '3/10/20/26'])(
    'refuses %s',
    (text) => {
      expect(iso(text)).toMatch(/^FAIL:/);
    },
  );

  it('asks for the day when only a month and year are typed', () => {
    const result = parseDateInput('Oct 2026', dmy);
    expect(!result.ok && result.reason).toMatch(/Add the day/);
  });

  it('refuses a short month prefix that could be two months', () => {
    expect(iso('3 ma')).toBe('FAIL:unrecognised');
    expect(iso('3 mar')).toBe('2026-03-03');
    expect(iso('3 may')).toBe('2026-05-03');
  });
});

describe('inputs', () => {
  it('refuses a today that is not a calendar day rather than guessing', () => {
    expect(() => parseDateInput('today', { ...dmy, today: 'soon' })).toThrow();
  });
});
