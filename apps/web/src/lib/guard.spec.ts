import { BRAND } from '@newax/shared';
import {
  COOLDOWN_DAYS,
  HOLD_IDLE,
  HOLD_MS,
  cooldownState,
  holdProgress,
  isVagueLabel,
  nextHold,
  type HoldState,
} from './guard';

const DAY = 86_400_000;

describe('nextHold (DNG-1)', () => {
  it('reads its length from the brand: one edit retunes every danger control', () => {
    expect(HOLD_MS).toBe(BRAND.safeguards.holdToConfirmMs);
    expect(HOLD_MS).toBe(1000);
  });

  it('starts on a press and does nothing else yet', () => {
    const { state, fired } = nextHold(HOLD_IDLE, { type: 'down', now: 100 }, HOLD_MS);
    expect(state).toEqual({ phase: 'holding', startedAt: 100 });
    expect(fired).toBe(false);
  });

  it('does not fire one millisecond short, and fires exactly at the length', () => {
    const holding: HoldState = { phase: 'holding', startedAt: 100 };
    expect(nextHold(holding, { type: 'tick', now: 100 + HOLD_MS - 1 }, HOLD_MS).fired).toBe(false);
    const at = nextHold(holding, { type: 'tick', now: 100 + HOLD_MS }, HOLD_MS);
    expect(at.fired).toBe(true);
    expect(at.state.phase).toBe('done');
  });

  it('fires once: later ticks and a repeated key-down do nothing', () => {
    const done: HoldState = { phase: 'done', startedAt: 0 };
    expect(nextHold(done, { type: 'tick', now: 5000 }, HOLD_MS).fired).toBe(false);
    expect(nextHold(done, { type: 'down', now: 5000 }, HOLD_MS)).toEqual({ state: done, fired: false });
  });

  it('a release or a cancel before the length does nothing and resets', () => {
    const holding: HoldState = { phase: 'holding', startedAt: 0 };
    expect(nextHold(holding, { type: 'up' }, HOLD_MS)).toEqual({ state: HOLD_IDLE, fired: false });
    expect(nextHold(holding, { type: 'cancel' }, HOLD_MS)).toEqual({ state: HOLD_IDLE, fired: false });
  });

  it('releasing after it fired makes the control usable again', () => {
    const done: HoldState = { phase: 'done', startedAt: 0 };
    expect(nextHold(done, { type: 'up' }, HOLD_MS).state).toEqual(HOLD_IDLE);
  });

  it('ignores a second press while one is under way, so the clock does not restart', () => {
    const holding: HoldState = { phase: 'holding', startedAt: 100 };
    expect(nextHold(holding, { type: 'down', now: 700 }, HOLD_MS).state).toBe(holding);
  });

  it('ignores a tick when nothing is held', () => {
    expect(nextHold(HOLD_IDLE, { type: 'tick', now: 99999 }, HOLD_MS)).toEqual({ state: HOLD_IDLE, fired: false });
  });
});

describe('holdProgress', () => {
  it('is 0 idle, 1 done, and proportional while holding', () => {
    expect(holdProgress(HOLD_IDLE, 500, 1000)).toBe(0);
    expect(holdProgress({ phase: 'done', startedAt: 0 }, 5000, 1000)).toBe(1);
    expect(holdProgress({ phase: 'holding', startedAt: 0 }, 250, 1000)).toBe(0.25);
  });

  it('is held to 0..1 even for a late frame or a clock that went backwards', () => {
    expect(holdProgress({ phase: 'holding', startedAt: 0 }, 5000, 1000)).toBe(1);
    expect(holdProgress({ phase: 'holding', startedAt: 1000 }, 500, 1000)).toBe(0);
  });

  it('reads a zero, negative or NaN length as complete rather than dividing by it', () => {
    expect(holdProgress({ phase: 'holding', startedAt: 0 }, 10, 0)).toBe(1);
    expect(holdProgress({ phase: 'holding', startedAt: 0 }, 10, -5)).toBe(1);
    expect(holdProgress({ phase: 'holding', startedAt: 0 }, 10, Number.NaN)).toBe(1);
  });
});

describe('isVagueLabel (DNG-2)', () => {
  it.each([
    'Yes',
    'yes',
    'OK',
    'Ok.',
    'Confirm',
    'CONFIRM',
    'Continue',
    'Submit',
    'Proceed',
    'Done',
    ' Sure ',
    'Accept',
    '',
    '   ',
  ])('rejects %j', (label) => {
    expect(isVagueLabel(label)).toBe(true);
  });

  it.each(['Delete project', 'Revoke key', 'Void 3 sales', 'Confirm delivery', 'Close FY2026', 'Write off SN-1'])(
    'accepts %j: a verb with its object',
    (label) => {
      expect(isVagueLabel(label)).toBe(false);
    },
  );
});

describe('cooldownState (DNG-6)', () => {
  const start = Date.UTC(2026, 9, 1, 12, 0, 0);

  it('reads its length from the brand', () => {
    expect(COOLDOWN_DAYS).toBe(BRAND.safeguards.deletionCooldownDays);
    expect(COOLDOWN_DAYS).toBe(14);
  });

  it('shows the full period on the first moment and a purge date 14 days on', () => {
    const c = cooldownState(start, 14, start);
    expect(c.daysLeft).toBe(14);
    expect(c.expired).toBe(false);
    expect(c.endsAt.getTime()).toBe(start + 14 * DAY);
  });

  it('rounds days left up, so the last partial day still says 1', () => {
    expect(cooldownState(start, 14, start + 13 * DAY + 1).daysLeft).toBe(1);
    expect(cooldownState(start, 14, start + 13 * DAY - 1).daysLeft).toBe(2);
  });

  it('ends exactly at the boundary and never goes negative after it', () => {
    const at = cooldownState(start, 14, start + 14 * DAY);
    expect(at.expired).toBe(true);
    expect(at.remainingMs).toBe(0);
    const after = cooldownState(start, 14, start + 30 * DAY);
    expect(after.remainingMs).toBe(0);
    expect(after.daysLeft).toBe(0);
  });

  it('accepts an ISO string or a Date for the request time', () => {
    const iso = new Date(start).toISOString();
    expect(cooldownState(iso, 14, start).daysLeft).toBe(14);
    expect(cooldownState(new Date(start), 14, start).daysLeft).toBe(14);
  });

  it('treats an unreadable date or a bad length as expired, so a corrupt row cannot keep something alive', () => {
    expect(cooldownState('not a date', 14, start).expired).toBe(true);
    expect(cooldownState(start, -1, start).expired).toBe(true);
    expect(cooldownState(start, Number.NaN, start).expired).toBe(true);
  });

  it('a zero-day cooldown is already over', () => {
    expect(cooldownState(start, 0, start).expired).toBe(true);
  });
});
