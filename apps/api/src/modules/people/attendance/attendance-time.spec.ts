import { workingDayOf, workedMinutesBetween } from './attendance-time';

const KARACHI = 'Asia/Karachi'; // UTC+5, no DST

describe('workingDayOf', () => {
  it('a night shift spanning midnight resolves to one working day, not two', () => {
    // 23:50 PKT on the 25th is 18:50 UTC the 25th; 05:50 PKT the next
    // calendar day is 00:50 UTC. With cutoverHour=6, the 05:50 clock-out
    // (local hour 5, before the cut-over) rolls back onto the same working
    // day as the 23:50 clock-in.
    const clockIn = new Date('2026-09-25T18:50:00.000Z'); // 23:50 PKT, 25th
    const clockOut = new Date('2026-09-26T00:50:00.000Z'); // 05:50 PKT, 26th

    expect(workingDayOf(clockIn, KARACHI, 6)).toBe('2026-09-25');
    expect(workingDayOf(clockOut, KARACHI, 6)).toBe('2026-09-25');
  });

  it('an instant exactly at the cut-over hour belongs to that calendar day, not the previous one', () => {
    const atCutover = new Date('2026-09-25T01:00:00.000Z'); // 06:00 PKT
    expect(workingDayOf(atCutover, KARACHI, 6)).toBe('2026-09-25');
  });

  it('one minute before the cut-over still rolls back to the previous day', () => {
    const justBefore = new Date('2026-09-25T00:59:00.000Z'); // 05:59 PKT
    expect(workingDayOf(justBefore, KARACHI, 6)).toBe('2026-09-24');
  });

  it('a daytime punch, far from the cut-over, is simply its own calendar day', () => {
    const midday = new Date('2026-09-25T07:00:00.000Z'); // 12:00 PKT
    expect(workingDayOf(midday, KARACHI, 6)).toBe('2026-09-25');
  });

  it('a cut-over of 0 (midnight) behaves exactly like a plain calendar day', () => {
    const justAfterMidnight = new Date('2026-09-24T19:00:01.000Z'); // 00:00:01 PKT the 25th
    expect(workingDayOf(justAfterMidnight, KARACHI, 0)).toBe('2026-09-25');
  });
});

describe('workedMinutesBetween', () => {
  it('is the plain difference for two instants with no timezone complication', () => {
    const start = new Date('2026-09-25T09:00:00.000Z');
    const end = new Date('2026-09-25T17:00:00.000Z');
    expect(workedMinutesBetween(start, end)).toBe(480);
  });

  /**
   * The doc's own acceptance criterion: "a DST transition night does not
   * gain or lose an hour of paid time." Spring-forward in America/New_York,
   * 2026-03-08: clocks jump from 01:59:59 EST straight to 03:00:00 EDT. A
   * shift from 01:30 EST to 03:30 EDT is 60 REAL minutes — the naive,
   * wrong answer a local-wall-clock subtraction gives is 120 (3:30 - 1:30).
   * Both instants below are true UTC instants, so the correct 60 falls out
   * of a plain subtraction with no DST-awareness needed in this function
   * itself — proving the schema's own rule ("never a local wall-clock
   * string") is what makes this correct.
   */
  it('a spring-forward DST transition does not gain an hour of paid time', () => {
    const clockIn = new Date('2026-03-08T06:30:00.000Z'); // 01:30 EST
    const clockOut = new Date('2026-03-08T07:30:00.000Z'); // 03:30 EDT
    expect(workedMinutesBetween(clockIn, clockOut)).toBe(60);
  });

  /**
   * Fall-back, 2026-11-01: clocks repeat 01:00-01:59 EDT then EST. A shift
   * from 00:30 EDT to 01:30 EST spans that repeated hour and is 120 REAL
   * minutes — the naive wrong answer is 60 (1:30 - 00:30).
   */
  it('a fall-back DST transition does not lose an hour of paid time', () => {
    const clockIn = new Date('2026-11-01T04:30:00.000Z'); // 00:30 EDT
    const clockOut = new Date('2026-11-01T06:30:00.000Z'); // 01:30 EST
    expect(workedMinutesBetween(clockIn, clockOut)).toBe(120);
  });

  it('is negative for an out-of-order pair — the caller decides what that means, this function only subtracts', () => {
    const start = new Date('2026-09-25T17:00:00.000Z');
    const end = new Date('2026-09-25T09:00:00.000Z');
    expect(workedMinutesBetween(start, end)).toBe(-480);
  });
});
