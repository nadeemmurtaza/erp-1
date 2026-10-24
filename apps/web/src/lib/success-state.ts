import { BRAND } from '@newax/shared';

/**
 * The arithmetic behind `SuccessState` (SUC-2..SUC-5): pure, no DOM, no clock,
 * so the numbers the component shows are tested instead of eyeballed, the same
 * split `lib/motion.ts` makes for the other expressive motion.
 */

const { duration, easing, distance, scale } = BRAND.theme.motion;
const { control } = BRAND.theme.size;

/** One step of a standing thread (SUC-4): finished, the one the thread is on, or still ahead. */
export type JourneyState = 'done' | 'current' | 'next';

/**
 * The state of each of `total` steps when the thread has `reached` the step at
 * that zero-based index (the last one that has happened). The step after it is
 * the one being waited on; everything beyond is ahead. A thread that has
 * reached its last step has no current step at all: nothing is left to wait on.
 *
 * `reached` comes from the record's own status, never from a guess: a "Paid"
 * step on a thing nothing tracks is invented progress (COG-10).
 */
export function journeyStates(total: number, reached: number): JourneyState[] {
  // A status that is not a number is treated as finished, as `clamp01` does: nothing is invented as still to come.
  const raw = Number.isFinite(reached) ? Math.trunc(reached) : total - 1;
  const last = Math.min(Math.max(raw, 0), Math.max(total - 1, 0));
  return Array.from({ length: Math.max(total, 0) }, (_, index): JourneyState => {
    if (index <= last) return 'done';
    if (index === last + 1) return 'current';
    return 'next';
  });
}

/** How many sparks one celebration throws. Eight reads as a ring at the badge's size; fewer look like a spinner, more like a flower. */
export const BURST_SPARKS = 8;

/** A spark's resting offset from the badge's centre, in px, at its start and at its furthest. */
export interface SparkTravel {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Where each of `count` sparks starts and ends, evenly round the badge with the
 * first straight up. A spark leaves from the badge's own edge (half the
 * `control.xl` the badge is drawn at) and travels `distance.medium` further, so
 * the burst scales with the tokens it is built from. Offsets are in px for a
 * `transform: translate()`; nothing here touches layout.
 */
export function burstTravel(count: number = BURST_SPARKS): SparkTravel[] {
  const edge = control.xl / 2;
  const reach = edge + distance.medium;
  return Array.from({ length: Math.max(count, 0) }, (_, index) => {
    const angle = (2 * Math.PI * index) / count - Math.PI / 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    return {
      fromX: round(dx * edge),
      fromY: round(dy * edge),
      toX: round(dx * reach),
      toY: round(dy * reach),
    };
  });
}

/**
 * The Web Animations keyframes for one spark: out along its ray while it
 * shrinks to `scale.pop` and fades. Transform and opacity only (MOT-5).
 */
export function sparkKeyframes(travel: SparkTravel): Keyframe[] {
  return [
    { transform: `translate(${travel.fromX}px, ${travel.fromY}px) scale(1)`, opacity: 1 },
    { transform: `translate(${travel.toX}px, ${travel.toY}px) scale(${scale.pop})`, opacity: 0 },
  ];
}

/**
 * How the burst is timed. It waits `slow` so it starts as the tick finishes
 * drawing (`DrawIcon` strokes run `slow`), then runs `sweep` on the `settle`
 * curve: long enough to read as a burst, not a flick, and never an overshoot.
 */
export const BURST_TIMING = {
  delay: duration.slow,
  duration: duration.sweep,
  easing: `cubic-bezier(${easing.settle.join(', ')})`,
} as const;
