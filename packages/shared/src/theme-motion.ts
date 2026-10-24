import { BRAND } from './brand';

/**
 * The motion tokens — a view onto BRAND.theme.motion.
 *
 * Web reads durations and easings as Tailwind utilities (`duration-fast`,
 * `ease-standard`) and as `--motion-*` custom properties; framer-motion and
 * React Native read the numbers directly. A duration written into a component
 * is the thing this layer exists to prevent.
 */
export const THEME_MOTION = BRAND.theme.motion;

/** `[0.2, 0, 0, 1]` -> `'cubic-bezier(0.2, 0, 0, 1)'`, for CSS. */
export function cubicBezier(points: readonly number[]): string {
  return `cubic-bezier(${points.join(', ')})`;
}

/** `220` -> `'220ms'`, for CSS. */
export function ms(value: number): string {
  return `${value}ms`;
}
