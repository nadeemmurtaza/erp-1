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
