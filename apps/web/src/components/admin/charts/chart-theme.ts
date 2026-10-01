import { THEME_COLORS, themeColorVar, toMajor } from '@newax/shared';

/**
 * WO-A.2 (10-admin-dashboard.md D9) — the one place a chart wrapper reads
 * colour, dash pattern, marker shape and money formatting from. No wrapper
 * hardcodes a hex; every one imports from here.
 *
 * Every colour here is a CSS custom-property reference (`themeColorVar`),
 * not a hex. A chart's strokes, ticks and fills are SVG attributes, which a
 * Tailwind class cannot reach — but `rgb(var(--color-…))` resolves through
 * the same property the utilities use, so a chart repaints the moment the
 * theme flips with no hook and no second copy of the palette. The hex values
 * live in `brand.ts` (light and dark) and nowhere else, which is the whole
 * point of Law 1; a rebrand or a contrast fix reaches these charts by
 * construction.
 */
/**
 * D1's own type, defined here rather than in `card-registry.ts` — every
 * chart wrapper needs it to know how to format a value, and `card-registry`
 * (A.4) is a consumer of the charts folder, not the other way round.
 */
export type ValueFormat = 'money' | 'integer' | 'percent' | 'percent-bps' | 'days' | 'rating' | 'text';

export const CHART_PALETTE: readonly string[] = THEME_COLORS.chart.map((_, i) => themeColorVar(`chart-${i}`));
export const GRID = themeColorVar('neutral-100');
export const SURFACE = themeColorVar('surface');
export const INK = themeColorVar('neutral-900');
export const INK_SOFT = themeColorVar('neutral-900', 0.6);
export const INK_FAINT = themeColorVar('neutral-900', 0.5);
export const POSITIVE = themeColorVar('feedback-positive');
export const NEGATIVE = themeColorVar('feedback-negative');
/**
 * The de-emphasis colour: the "previous period" beside a current one, and the
 * "Other" slice of a share. Context, not identity, so it is a neutral and never
 * a categorical slot (dataviz: emphasis is one hue plus a gray). `neutral-400`
 * holds 3.3:1 on the light surface and 5.3:1 on the dark one, over the 3:1 floor
 * for a mark.
 */
export const CONTEXT = themeColorVar('neutral-400');
/** The wash behind the bar or slice under the pointer: a lift, not an outline. */
export const HOVER_WASH = themeColorVar('neutral-100', 0.6);

/**
 * Dash pattern per series index — `strokeDasharray` values, index-aligned
 * with `CHART_PALETTE`. A two-series chart must stay readable in greyscale
 * (WO-A.2's own acceptance criterion), so colour is never the only signal.
 * `undefined` (index 0) is a solid line, matching every existing
 * single-series chart's own look.
 */
export const DASH_PATTERNS: readonly (string | undefined)[] = [
  undefined,
  '6 3',
  '2 3',
  '8 3 2 3',
  '4 4',
  '1 3',
];

/** Marker shape per series index, same alignment — the third channel alongside colour and dash. */
export const MARKER_SHAPES: readonly ('circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'star')[] = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'cross',
  'star',
];

export function paletteColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length]!;
}

export function dashFor(index: number): string | undefined {
  return DASH_PATTERNS[index % DASH_PATTERNS.length];
}

export function markerFor(index: number): (typeof MARKER_SHAPES)[number] {
  return MARKER_SHAPES[index % MARKER_SHAPES.length]!;
}

/**
 * Ported verbatim from `sales-chart.tsx` (retired in WO-E.2) — a
 * Pakistan-specific asset (lakh notation) that must not be lost when that
 * file goes. Takes **rupees** (major units), not paisa.
 */
export function compactRupees(rupees: number): string {
  if (rupees >= 100_000) return `${(rupees / 100_000).toFixed(1)}L`;
  if (rupees >= 1_000) return `${Math.round(rupees / 1_000)}k`;
  return String(Math.round(rupees));
}

/** Same lakh notation, taking paisa — what every chart in `charts/` actually receives (D9: "money charts receive paisa"). */
export function compactMoney(paisa: number): string {
  return compactRupees(toMajor(paisa));
}
