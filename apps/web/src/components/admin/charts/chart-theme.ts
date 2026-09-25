import { THEME_COLORS, toMajor } from '@newax/shared';

/**
 * WO-A.2 (10-admin-dashboard.md D9) — the one place a chart wrapper reads
 * colour, dash pattern, marker shape and money formatting from. No wrapper
 * hardcodes a hex; every one imports from here.
 *
 * `GRID`/`SURFACE`/`INK` are read live from `THEME_COLORS` rather than the
 * literal values D9's own prose quotes (`#e9e0cd`/`#050505`) — those were
 * accurate to an earlier draft of `brand.ts`; the neutral ramp has since
 * moved (`check-contrast.mjs`'s own contrast fixes), and importing the
 * current token is what keeps a rebrand or a future contrast fix reaching
 * these charts automatically, which is the whole point of Law 1.
 */
/**
 * D1's own type, defined here rather than in `card-registry.ts` — every
 * chart wrapper needs it to know how to format a value, and `card-registry`
 * (A.4) is a consumer of the charts folder, not the other way round.
 */
export type ValueFormat = 'money' | 'integer' | 'percent' | 'percent-bps' | 'days' | 'rating' | 'text';

export const CHART_PALETTE: readonly string[] = THEME_COLORS.chart;
export const GRID = THEME_COLORS.neutral[100];
export const SURFACE = THEME_COLORS.white;
export const INK = THEME_COLORS.neutral[900];
export const INK_SOFT = withAlpha(THEME_COLORS.neutral[900], 0.6);
export const INK_FAINT = withAlpha(THEME_COLORS.neutral[900], 0.5);
export const POSITIVE = THEME_COLORS.feedback.positive;
export const NEGATIVE = THEME_COLORS.feedback.negative;

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

/** #rrggbb -> rgba(...) at the given alpha. Recharts stroke/fill props take a plain CSS colour string, not a class. */
function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
