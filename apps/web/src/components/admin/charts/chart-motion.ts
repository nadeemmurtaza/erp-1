import type { CSSProperties } from 'react';
import { BRAND } from '@newax/shared';
import { settle, staggerDelayMs } from '@/lib/motion';
import { CONTEXT, HOVER_WASH, SURFACE } from './chart-theme';

/**
 * How a chart moves: one place, read from the motion tokens, so every series,
 * tooltip, cursor and marker in `charts/` shares the curve and the clock the
 * rest of the product uses (docs/design/motion/05-motion.md).
 *
 * Recharts ships its own motion (1500 ms for a line, 400 ms for a bar, an
 * `ease` curve, a 400 ms tooltip glide). That is a film; this is the language.
 * Nothing here is a number of its own: durations come from `duration`, the
 * curve from `easing.settle`, the stagger from `staggerDelayMs`, the marker
 * entrance from the `.chart-point` class in globals.css.
 *
 * What moves, and only that: a series is revealed (Recharts draws the stroke or
 * grows the bar over `sweep`), a tooltip glides (a transform, `normal`), a marker
 * pops in (transform and opacity, `fast`). Nothing overshoots: `settle` stays at
 * or under 1, and no easing here is `emphasized`. Under `prefers-reduced-motion`
 * every helper switches the motion off and every value is still drawn.
 *
 * Pure: no DOM, no clock, no React runtime, so every number is unit-tested.
 */

const { duration, easing } = BRAND.theme.motion;

/**
 * A chart entrance is a page-level figure resolving, so it takes the `sweep`
 * step: the longest the language allows (420 ms). Every series uses this same
 * duration; only its start moves (see `chartDrawProps`).
 */
export const CHART_DRAW_MS: number = duration.sweep;

/** A marker pops over `fast` (the `.chart-point` class animates it; this is the same token). */
export const CHART_POP_MS: number = duration.fast;

/** The tooltip glide between points: movement, so `normal`. */
export const CHART_TOOLTIP_MS: number = duration.normal;

/**
 * Recharts types an easing as `'cubic-bezier(n,n,n,n)'` with no spaces, so that
 * is the form built here (it is also valid CSS, which the tooltip's own
 * transition needs). `parseFloat` on the Recharts side and the browser on the CSS
 * side read it the same way.
 */
export type ChartEasing = `cubic-bezier(${number},${number},${number},${number})`;

/** A token's `[x1, y1, x2, y2]` tuple as the `cubic-bezier(...)` string both Recharts and CSS accept. */
export function cubicBezierCss([x1, y1, x2, y2]: readonly [number, number, number, number]): ChartEasing {
  return `cubic-bezier(${x1},${y1},${x2},${y2})`;
}

/** `easing.settle` as a string: quick out of the blocks, a long unhurried finish, no overshoot. */
export const CHART_EASING: ChartEasing = cubicBezierCss(easing.settle);

export interface ChartDrawProps {
  isAnimationActive: boolean;
  animationBegin: number;
  animationDuration: number;
  animationEasing: ChartEasing;
}

/**
 * The entrance of one Recharts series (`Line`, `Area`, `Bar`, `Pie`, `Radar`).
 * Spread it onto the series: `<Line {...chartDrawProps(reduced, index)} />`.
 *
 * Same duration and curve for every series, so a chart reads as one event; the
 * series start `staggerDelayMs(seriesIndex)` apart (0, 80, 160, 240 ms, then the
 * 320 ms cap, MOT-6), so the first draws, the next follow, and a six-layer
 * stack does not feel slow. The stagger is also applied when Recharts replays
 * the animation for new data or a legend toggle; pass the series' place among
 * the *visible* ones so the first visible series always starts at once.
 *
 * Reduced motion: animation off, no delay, and the series is drawn whole.
 */
export function chartDrawProps(reduced: boolean, seriesIndex = 0): ChartDrawProps {
  return {
    isAnimationActive: !reduced,
    animationBegin: reduced ? 0 : staggerDelayMs(seriesIndex),
    animationDuration: CHART_DRAW_MS,
    animationEasing: CHART_EASING,
  };
}

export interface ChartTooltipMotion {
  isAnimationActive: boolean;
  animationDuration: number;
  animationEasing: ChartEasing;
}

/**
 * Props for Recharts' `<Tooltip>`: it glides from one point to the next over the
 * `normal` step on `settle` (a CSS transform on the tooltip's wrapper, so it is
 * transform-only), instead of Recharts' 400 ms `ease`. Reduced motion turns the
 * glide off (the tooltip then jumps, which still shows every value).
 */
export function chartTooltipMotion(reduced: boolean): ChartTooltipMotion {
  return {
    isAnimationActive: !reduced,
    animationDuration: CHART_TOOLTIP_MS,
    animationEasing: CHART_EASING,
  };
}

/**
 * A point on the line counts as reached when the line has covered this share of
 * the way to it. A share of exactly 1 is only ever met at the very end of an
 * ease that settles, which would hold the last marker back for a line that
 * already looks finished.
 */
const REACHED = 0.98;

/**
 * The time, as a share of the draw (0 to 1), at which the eased line has covered
 * `covered` (0 to 1) of its length: the inverse of `settle`. Recharts reveals the
 * line along `animationEasing`, so a marker that waited for the *linear* share of
 * the draw would pop long after the line had passed it. `settle` rises steadily
 * and never overshoots, so a bisection finds the time to well under a frame.
 */
function timeToCover(covered: number): number {
  if (covered <= 0) return 0;
  if (covered >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (settle(mid) < covered) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * When, in ms after the chart mounts, the marker at `index` of `count` should
 * pop: as the line reaches it, plus its own series' stagger. The first marker
 * and a lone marker pop at the series' start; the last one is clamped so the
 * pop itself (`CHART_POP_MS`) finishes inside the draw. It never exceeds
 * `drawMs` plus the series' stagger.
 */
export function pointPopDelayMs(index: number, count: number, drawMs = CHART_DRAW_MS, seriesIndex = 0): number {
  const start = staggerDelayMs(seriesIndex);
  if (count <= 1 || !(drawMs > 0)) return start;
  const place = Math.min(1, Math.max(0, index / (count - 1)));
  const reachedAt = timeToCover(place * REACHED) * drawMs;
  const latest = Math.max(0, drawMs - CHART_POP_MS);
  return start + Math.round(Math.min(reachedAt, latest));
}

/**
 * The `--pop-delay` that `.chart-point` reads (globals.css), for one marker:
 * `<g className="chart-point" style={pointPopStyle(i, n, CHART_DRAW_MS, s)}>`.
 * Under reduced motion the stylesheet zeroes every delay, so this needs no flag.
 */
export function pointPopStyle(index: number, count: number, drawMs = CHART_DRAW_MS, seriesIndex = 0): CSSProperties {
  return { ['--pop-delay' as string]: `${pointPopDelayMs(index, count, drawMs, seriesIndex)}ms` };
}

/**
 * The pointer's mark on a chart, passed to `<Tooltip cursor={...}>`. Neither
 * moves with a transition: the cursor is redrawn at the hovered category, so it
 * snaps from one to the next (a glide would lag behind the pointer).
 *
 * `stroke: 'none'` on the band matters: Recharts' own default cursor stroke is
 * a hex (`#ccc`), which would outline the band and be a second palette.
 */
export const chartCursor = {
  /** Bar charts: a muted wash behind the hovered category, a small radius. */
  band: { fill: HOVER_WASH, stroke: 'none', radius: 4 },
  /** Line, area and step charts: a 1 px line through the hovered point, at the context ink (3:1 on the surface). */
  crosshair: { stroke: CONTEXT, strokeWidth: 1 },
} as const;

/**
 * The enlarged dot on the hovered point of a line or area: radius 5 with a
 * surface ring so it reads against the line, and `.chart-point` so it grows in
 * from `scale.pop` over `fast` instead of appearing. Its fill is the series
 * colour, which Recharts supplies.
 */
export const chartActiveDot = { r: 5, stroke: SURFACE, strokeWidth: 2, className: 'chart-point' } as const;
