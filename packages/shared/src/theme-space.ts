import { BRAND } from './brand';

/**
 * The spacing scale — a view onto BRAND.theme.space.
 *
 * Web reads these as Tailwind's own steps (`THEME_SPACE[3]` = 8px = `p-2`);
 * React Native has no such utility and reads the numbers. The match between
 * the two is asserted by `theme-space.spec.ts`, not by this comment.
 */
export const THEME_SPACE = BRAND.theme.space;
export type SpaceStep = keyof typeof THEME_SPACE;

/** `8` -> `'0.5rem'`, for the CSS side. */
export function spaceRem(px: number): string {
  return `${px / 16}rem`;
}

/** Tailwind's spacing key for a px value on its 4px grid: `8` -> `'2'`, `2` -> `'0.5'`. */
export function tailwindSpacingKey(px: number): string {
  return String(px / 4);
}
