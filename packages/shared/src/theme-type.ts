/**
 * The type scale, for every surface of the product.
 *
 * Like the radius scale before it, this existed twice and disagreed at every
 * step. Web ran on Tailwind's defaults, mobile on a hand-picked set in
 * theme.ts, and nobody chose the difference — two people sized text
 * independently:
 *
 *     step      web            mobile (was)
 *     small     12px           11px
 *     body      14px           13px
 *     ...       16px           15px
 *     heading   20px           17px
 *     title     24px           22px
 *
 * The values here are Tailwind's own, because web already uses those
 * utilities at 817 call sites and inventing a new scale would have meant
 * restyling the entire site to fix a mobile inconsistency. Mobile moves up to
 * meet them, which is the safe direction: every step gets slightly larger,
 * and a 16px body matches what both iOS and Android recommend far better than
 * the 15px it was.
 *
 * `line` is carried alongside `size` because React Native needs an explicit
 * lineHeight — omit it there and long Urdu strings collide, the same reason
 * globals.css sets `line-height: 2.1` for Nastaliq.
 *
 * Web consumes this through tailwind.config.ts, which builds `fontSize` from
 * it, so `text-sm` resolves here rather than to Tailwind's built-in copy.
 */
export interface TypeStep {
  /** px */
  readonly size: number;
  /** px */
  readonly line: number;
}

export const THEME_TYPE = {
  /** Captions, table meta, the quiet second line under a name. */
  tiny: { size: 12, line: 16 },
  /** The workhorse. Table cells, form labels, body copy in dense UI. */
  small: { size: 14, line: 20 },
  /** Reading size. Storefront prose, and any input on a phone. */
  body: { size: 16, line: 24 },
  large: { size: 18, line: 28 },
  /** Section headings. */
  heading: { size: 20, line: 28 },
  /** Page titles. */
  title: { size: 24, line: 32 },
  /** Hero and display copy only. */
  display: { size: 30, line: 36 },
} as const satisfies Record<string, TypeStep>;

/**
 * The scale keyed by Tailwind's utility names, in rem, ready for
 * `theme.fontSize`. Tailwind wants `[size, { lineHeight }]` tuples.
 */
export const TAILWIND_FONT_SIZE = {
  xs: rem(THEME_TYPE.tiny),
  sm: rem(THEME_TYPE.small),
  base: rem(THEME_TYPE.body),
  lg: rem(THEME_TYPE.large),
  xl: rem(THEME_TYPE.heading),
  '2xl': rem(THEME_TYPE.title),
  '3xl': rem(THEME_TYPE.display),
} as const;

function rem(step: TypeStep): [string, { lineHeight: string }] {
  return [`${step.size / 16}rem`, { lineHeight: `${step.line / 16}rem` }];
}
