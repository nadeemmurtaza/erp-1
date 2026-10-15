import { BRAND } from '@newax/shared';

/**
 * The arithmetic behind the motion that CSS cannot express.
 *
 * Almost all of the motion language is CSS, driven by the `--motion-*` custom
 * properties that brand.ts publishes (docs/design/motion/05-motion.md). The
 * handful of motions that change a *value* rather than a property — a figure
 * counting up, a code resolving out of noise, a line typed out — need the same
 * curves and the same stagger cap in JavaScript. They are here, as pure
 * functions with no DOM and no clock, so the numbers they produce are tested
 * rather than eyeballed and so they stay in step with the tokens by reading
 * them, not by repeating them.
 */

const { easing, duration, stagger, speed, distance } = BRAND.theme.motion;

type Bezier = readonly [number, number, number, number];

/**
 * A CSS `cubic-bezier(x1, y1, x2, y2)` as a function of time, so a JS-driven
 * value follows exactly the curve the same token draws in a stylesheet.
 *
 * The curve is parametric in `s`; to read it by x (time) the x polynomial is
 * inverted with a few Newton steps, falling back to bisection where the slope
 * is too flat for Newton to be safe. 1e-5 is far below one pixel of any
 * movement here and below one display frame of any duration here.
 */
export function bezierEase([x1, y1, x2, y2]: Bezier): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  const solve = (x: number): number => {
    let s = x;
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(s) - x;
      if (Math.abs(error) < 1e-5) return s;
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    while (lo < hi) {
      const error = sampleX(s) - x;
      if (Math.abs(error) < 1e-5) return s;
      if (error > 0) hi = s;
      else lo = s;
      const next = (hi + lo) / 2;
      if (next === s) return s;
      s = next;
    }
    return s;
  };

  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solve(t));
  };
}

/** The `settle` curve: fast out of the blocks, long unhurried finish, never an overshoot. */
export const settle = bezierEase(easing.settle);

/** Clamp a progress value into 0–1. Anything not finite is treated as finished. */
export function clamp01(progress: number): number {
  if (!Number.isFinite(progress)) return 1;
  return Math.min(1, Math.max(0, progress));
}

/**
 * The value a count-up shows at `progress` (0–1 of its duration). It lands on
 * `to` exactly at the end — never `to - 0.0000001` formatted as a rounded-down
 * figure — so what the animation ends on is always what the data says.
 */
export function countUpValue(from: number, to: number, progress: number): number {
  const p = clamp01(progress);
  if (p >= 1) return to;
  return from + (to - from) * settle(p);
}

/** How many of `total` units (characters, steps) are revealed at `progress`. */
export function revealedCount(total: number, progress: number): number {
  return Math.min(total, Math.floor(total * clamp01(progress)));
}

/**
 * The delay, in ms, of the item at a zero-based `index` of a staggered group.
 * The ramp is capped at `stagger.steps` (MOT-6): from the fifth peer on they
 * share one delay, so a long list never feels slow. It mirrors `.stagger` in
 * globals.css, which is the same ramp in `animation-delay`.
 */
export function staggerDelayMs(index: number): number {
  return Math.min(Math.max(0, index), stagger.steps) * stagger.step;
}

/**
 * The same capped ramp at the fine step, for a grid of many small peers (a
 * product grid, CRD-6). A separate function rather than a second argument:
 * `array.map(staggerDelayMs)` passes the index as its second argument.
 */
export function fineStaggerDelayMs(index: number): number {
  return Math.min(Math.max(0, index), stagger.steps) * stagger.fine;
}

/**
 * A glyph of the same kind as `char`, so noise keeps the width and rhythm of
 * the text it will resolve to: a digit becomes a digit, a letter a letter of the
 * same case, and anything else (a space, a comma, a hyphen) stays put. A code
 * like `INV-2041` therefore never reflows while it decodes.
 */
const DIGITS = '0123456789';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';

export function noiseGlyph(char: string, random: () => number): string {
  const pool = DIGITS.includes(char) ? DIGITS : UPPER.includes(char) ? UPPER : LOWER.includes(char) ? LOWER : null;
  if (pool === null) return char;
  return pool[Math.floor(random() * pool.length)] ?? char;
}

/**
 * One frame of a decode: the leading `revealedCount` characters are the real
 * text, the rest are noise. `random` is injected so a test can pin it.
 */
export function scrambleFrame(target: string, progress: number, random: () => number): string {
  const chars = Array.from(target);
  const keep = revealedCount(chars.length, progress);
  return chars.map((char, i) => (i < keep ? char : noiseGlyph(char, random))).join('');
}

/** One frame of a typed reveal: the leading characters of `target`, nothing else. */
export function typedFrame(target: string, progress: number): string {
  const chars = Array.from(target);
  return chars.slice(0, revealedCount(chars.length, progress)).join('');
}

/**
 * One frame of a word-by-word reveal: the leading whole words of `target`, each
 * with the whitespace that follows it, so the result is always a prefix of the
 * target and never a half word.
 */
export function typedWordsFrame(target: string, progress: number): string {
  const words = target.match(/\s*\S+\s*/g) ?? [];
  return words.slice(0, revealedCount(words.length, progress)).join('');
}

/**
 * How full a determinate bar is, 0–1. `value` and `max` come from data, so
 * anything that is not a finite number, or a `max` that is not above zero, is an
 * empty bar and not a NaN written into a transform. (`clamp01` treats a
 * non-finite value as *finished*, which is right for an animation clock and
 * wrong for a quantity.)
 */
export function progressFraction(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/** The longest a truncated label may take to scroll, ms: past it the reader has read it or gone. */
export const REVEAL_MAX_MS = 5000;

/**
 * The scroll that shows the end of a label cut short by an ellipsis. `overflowPx`
 * is the hidden width. Under one pixel is rounding, not truncation, so there is
 * nothing to run. The duration is the distance at the reading speed
 * (`speed.read`, px per second), never under `fast` (a few pixels would be a
 * jerk) and never over `REVEAL_MAX_MS` (a long line moves faster instead).
 */
export function revealRun(overflowPx: number): { shift: number; durationMs: number } | null {
  if (!Number.isFinite(overflowPx) || overflowPx < 1) return null;
  const shift = Math.ceil(overflowPx);
  const durationMs = Math.min(REVEAL_MAX_MS, Math.max(duration.fast, Math.round((shift / speed.read) * 1000)));
  return { shift, durationMs };
}

/**
 * The state of a text that swaps in place: what is showing, what is on its way
 * out, and how many times it has changed (the first value is change 0 and does
 * not animate). A change puts the old text in `previous` for the caller to
 * remove after the exit; reduced motion never keeps one, so the swap is just a
 * change.
 */
export interface SwapState {
  current: string;
  previous: string | null;
  changes: number;
}

export function nextSwap(state: SwapState, value: string, reduced: boolean): SwapState {
  if (value === state.current) return state;
  return { current: value, previous: reduced ? null : state.current, changes: state.changes + 1 };
}

/**
 * Where a dialog opened from a control arrives from: the offset between the
 * centre of that control and the centre of the dialog, each axis held to
 * `distance.large` so a trigger at the far corner of a wide screen does not
 * make the panel fly across it. Anything not finite is no offset.
 */
export function originOffset(
  trigger: { x: number; y: number },
  panel: { x: number; y: number },
): { dx: number; dy: number } {
  const limit = distance.large;
  const axis = (from: number, to: number) => {
    const delta = from - to;
    return Number.isFinite(delta) ? Math.min(limit, Math.max(-limit, delta)) : 0;
  };
  return { dx: axis(trigger.x, panel.x), dy: axis(trigger.y, panel.y) };
}

/**
 * The characters of a formatted figure as odometer parts: an ASCII digit rolls
 * (`digit` is its value 0–9), anything else (a separator, a currency sign, a
 * letter, a digit of another script) stays put. Parts are counted from the
 * right as well, so a strip keeps its identity when the figure gains a digit.
 */
export type ReelPart = { kind: 'digit'; digit: number } | { kind: 'fixed'; char: string };

export function reelParts(formatted: string): ReelPart[] {
  return Array.from(formatted).map((char) =>
    char >= '0' && char <= '9' ? { kind: 'digit', digit: Number(char) } : { kind: 'fixed', char },
  );
}

/**
 * Stroke geometry for a progress ring: the dash array is the circumference and
 * the offset is how much of it is still undrawn. `fraction` is clamped, so a
 * value of 1.2 (over target) draws a full ring rather than wrapping.
 */
export function ringStroke(radius: number, fraction: number): { circumference: number; offset: number } {
  const circumference = 2 * Math.PI * radius;
  return { circumference, offset: circumference * (1 - clamp01(fraction)) };
}

/**
 * How long a JS-driven motion runs, by name, from the same tokens CSS reads.
 * `count` is a page-level figure resolving, so it takes the `sweep` step;
 * `scramble` and `type` are short labels and take `slow`.
 */
export const MOTION_MS = {
  count: duration.sweep,
  scramble: duration.slow,
  type: duration.slow,
  exit: duration.fast,
  /** The sheen is one `sweep` across a surface; the flag that plays it is cleared when it has crossed. */
  sheen: duration.sweep,
  /** A drawn check (`Button done`, FRM-6) is one `slow` stroke; a page that leaves on success waits this long so it is seen. */
  done: duration.slow,
} as const;

/**
 * The lean of a card toward a pointer, in degrees (ADR-083, twelfth addendum). The pointer's offset
 * from the card's centre, as a fraction of half its width and height, times `tilt.maxDeg`: at the
 * centre the card is flat, at an edge it is at the limit, and nothing leans past it however far the
 * pointer is reported to be (a pointer captured outside the box, a fast move before the leave).
 * `x` is the rotation about the horizontal axis (pointer low leans the card's bottom away from you),
 * `y` about the vertical (pointer right leans its right side away). A card with no size does not lean.
 */
export function tiltAngles(
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
  maxDeg: number = BRAND.theme.motion.tilt.maxDeg,
): { x: number; y: number } {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  const fx = clampSigned((offsetX - width / 2) / (width / 2));
  const fy = clampSigned((offsetY - height / 2) / (height / 2));
  // `+ 0` turns -0 into 0, so a pointer at the centre writes "0.00deg" and not "-0.00deg".
  return { x: round2(-fy * maxDeg) + 0, y: round2(fx * maxDeg) + 0 };
}

function clampSigned(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
