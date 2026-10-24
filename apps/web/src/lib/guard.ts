import { BRAND } from '@newax/shared';

/**
 * The rules behind the danger controls (DNG-1 to DNG-6), kept out of the
 * components so they can be tested without a DOM and read without a render.
 *
 * Every function here takes the time as an argument. Nothing calls `Date.now()`
 * on its own, so a hold that lasted 999 ms and one that lasted 1 000 ms are two
 * lines in a spec rather than a flaky timer.
 */

/* ── hold to confirm (DNG-1) ───────────────────────────────────────────── */

/**
 * Where a hold is. `holding` carries the moment the press began; `done` means
 * the act has fired and is not to fire again until the press is released.
 */
export type HoldState =
  { phase: 'idle' } | { phase: 'holding'; startedAt: number } | { phase: 'done'; startedAt: number };

export type HoldEvent =
  { type: 'down'; now: number } | { type: 'tick'; now: number } | { type: 'up' } | { type: 'cancel' };

export const HOLD_IDLE: HoldState = { phase: 'idle' };

/**
 * The next state of a hold, and whether this event is the one that fires it.
 *
 * Fires exactly once: the tick that carries `now` to `holdMs` or past it. A
 * release, a cancel (the pointer left, focus moved, Escape) or a second `down`
 * while one is under way never fires; a `down` while `done` is ignored, so a
 * key that auto-repeats cannot confirm twice. Releasing returns to `idle`,
 * done or not, which is what lets the control be used again.
 */
export function nextHold(state: HoldState, event: HoldEvent, holdMs: number): { state: HoldState; fired: boolean } {
  switch (event.type) {
    case 'down':
      return state.phase === 'idle'
        ? { state: { phase: 'holding', startedAt: event.now }, fired: false }
        : { state, fired: false };
    case 'tick':
      if (state.phase === 'holding' && event.now - state.startedAt >= holdMs) {
        return { state: { phase: 'done', startedAt: state.startedAt }, fired: true };
      }
      return { state, fired: false };
    case 'up':
    case 'cancel':
      return { state: HOLD_IDLE, fired: false };
  }
}

/**
 * How far round the ring is, 0 to 1. Held to that range so a late frame cannot
 * draw past a full ring, and a bad `holdMs` (zero, negative, NaN) reads as
 * complete rather than dividing by zero.
 */
export function holdProgress(state: HoldState, now: number, holdMs: number): number {
  if (state.phase === 'idle') return 0;
  if (state.phase === 'done') return 1;
  if (!(holdMs > 0)) return 1;
  return Math.min(1, Math.max(0, (now - state.startedAt) / holdMs));
}

/** The hold length from the brand, so one edit retunes every danger control. */
export const HOLD_MS = BRAND.safeguards.holdToConfirmMs;

/* ── verb labels (DNG-2) ───────────────────────────────────────────────── */

/**
 * Words that confirm nothing. A button that says one of these makes the reader
 * work out what "Yes" refers to, which is the moment a person agrees to the
 * wrong thing. Matched on the whole label, so "Confirm delivery" (a verb and an
 * object) is fine and a bare "Confirm" is not.
 */
const VAGUE_LABELS = new Set([
  'yes',
  'ok',
  'okay',
  'confirm',
  'continue',
  'proceed',
  'submit',
  'sure',
  'go',
  'done',
  'accept',
]);

export function isVagueLabel(label: string): boolean {
  const word = label
    .trim()
    .toLowerCase()
    .replace(/[\s.!…]+$/u, '');
  return word.length === 0 || VAGUE_LABELS.has(word);
}

/* ── cooldown (DNG-6) ──────────────────────────────────────────────────── */

const MS_PER_DAY = 86_400_000;

export interface Cooldown {
  /** When the thing is purged and can no longer be restored. */
  endsAt: Date;
  /** Milliseconds left; 0 once it has ended, never negative. */
  remainingMs: number;
  /** Whole days left, rounded up so "14 days" shows on day one and "1 day" on the last. */
  daysLeft: number;
  expired: boolean;
}

/**
 * The state of a cooling-off period that began at `requestedAt` and lasts
 * `days`. A day is 24 hours, not a calendar day: the period is a promise of a
 * length of time, and an hour lost to a clock change is not worth a rule about
 * calendars (the purge job runs on the same clock this does).
 *
 * An unreadable date reads as expired with nothing left, so a corrupt row can
 * never claim "14 days left" and keep something alive forever.
 */
export function cooldownState(requestedAt: Date | string | number, days: number, now: number): Cooldown {
  const start = new Date(requestedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(days) || days < 0) {
    return { endsAt: new Date(0), remainingMs: 0, daysLeft: 0, expired: true };
  }
  const end = start + days * MS_PER_DAY;
  const remainingMs = Math.max(0, end - now);
  return {
    endsAt: new Date(end),
    remainingMs,
    daysLeft: Math.ceil(remainingMs / MS_PER_DAY),
    expired: remainingMs === 0,
  };
}

/** The cooling-off length from the brand. */
export const COOLDOWN_DAYS = BRAND.safeguards.deletionCooldownDays;
