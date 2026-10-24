import { BRAND } from './brand';

/**
 * The type scale — a view onto BRAND.theme.type.
 *
 * `line` travels with `size` because React Native derives neither, and
 * Nastaliq descenders collide without an explicit line height.
 *
 * Web consumes this through tailwind.config.ts, which builds `fontSize`
 * from TAILWIND_FONT_SIZE below, so `text-sm` and mobile's
 * `theme.text.small` resolve to the same number instead of the 14-vs-13
 * they used to.
 */
export interface TypeStep {
  /** px */
  readonly size: number;
  /** px */
  readonly line: number;
}

export const THEME_TYPE = BRAND.theme.type;

/** Font families, for the Tailwind config and mobile's theme. */
export const THEME_FONTS = BRAND.theme.fonts;

function rem(step: TypeStep): [string, { lineHeight: string }] {
  return [`${step.size / 16}rem`, { lineHeight: `${step.line / 16}rem` }];
}

/** The scale keyed by Tailwind's utility names, ready for `theme.fontSize`. */
export const TAILWIND_FONT_SIZE = {
  '2xs': rem(THEME_TYPE.micro),
  xs: rem(THEME_TYPE.tiny),
  sm: rem(THEME_TYPE.small),
  base: rem(THEME_TYPE.body),
  lg: rem(THEME_TYPE.large),
  xl: rem(THEME_TYPE.heading),
  '2xl': rem(THEME_TYPE.title),
  '3xl': rem(THEME_TYPE.display),
  metric: rem(THEME_TYPE.metric),
} as const;
