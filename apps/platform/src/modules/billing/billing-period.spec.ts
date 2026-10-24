import { currentCalendarMonthPeriod } from './billing-period';

describe('currentCalendarMonthPeriod', () => {
  it('returns the UTC calendar-month boundaries for the given date', () => {
    const { periodStart, periodEnd } = currentCalendarMonthPeriod(new Date('2026-09-17T13:45:00Z'));

    expect(periodStart.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('rolls over into the next calendar year for December', () => {
    const { periodStart, periodEnd } = currentCalendarMonthPeriod(new Date('2026-12-25T00:00:00Z'));

    expect(periodStart.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
