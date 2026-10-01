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

const { easing, duration, stagger } = BRAND.theme.motion;

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
} as const;
