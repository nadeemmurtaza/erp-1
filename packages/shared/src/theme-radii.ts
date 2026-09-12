/**
 * The corner radius scale, for every surface of the product.
 *
 * This lived in two places that could not see each other: `--radius` in
 * apps/web's globals.css, and a separate `{ sm: 6, md: 10, lg: 16 }` in
 * apps/mobile's theme.ts. Same concern, two sources, and they disagreed —
 * the website went square while the app stayed noticeably rounded, so the
 * two read as different products from the first glance. CSS custom
 * properties are invisible to React Native, which is exactly how the fork
 * survived being noticed.
 *
 * Numbers, not strings, because React Native's StyleSheet needs numbers and
 * CSS is happy to be handed `2px` built from one. Web consumes these through
 * tailwind.config.ts, which injects them as the `--radius` custom properties
 * globals.css already reads; mobile imports them directly.
 *
 * `sharp` is the house shape. `lg` is barely softer and is for the few large
 * surfaces — sheets, modals — where a hard 2px corner on a big panel reads as
 * unfinished. `pill` is not a radius choice at all: it is how you say
 * "circle" for an avatar or a round icon button, and it never changes when
 * the sharpness does.
 */
export const THEME_RADII = {
  sharp: 2,
  lg: 3,
  pill: 9999,
} as const;

/** `2` -> `'2px'`, for the CSS side. */
export function radiusPx(value: number): string {
  return `${value}px`;
}
