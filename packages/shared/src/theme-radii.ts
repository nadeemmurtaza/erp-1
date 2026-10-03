import { BRAND } from './brand';

/**
 * The radius scale — a view onto BRAND.theme.radii.
 *
 * Web consumes these through tailwind.config.ts, which injects them as the
 * `--radius` custom properties globals.css reads; mobile imports them
 * directly. A CSS variable is invisible to React Native, which is how the
 * site and the app came to disagree about the house shape before this.
 */
export const THEME_RADII = BRAND.theme.radii;

/** `2` -> `'2px'`, for the CSS side. */
export function radiusPx(value: number): string {
  return `${value}px`;
}

/**
 * The corner of something set inside a rounded container (CRD-5): the outer
 * corner minus the gap between them, so the two curves share a centre and read
 * as one shape. A 24 px card with an 8 px inset holds a 16 px image. Never
 * negative: where the gap is larger than the outer radius the inner corner is
 * square, which is exactly what the house shape produces (a 3 px card with an
 * 8 px inset holds a square image).
 */
export function concentricRadius(outer: number, inset: number): number {
  return Math.max(0, outer - Math.max(0, inset));
}
