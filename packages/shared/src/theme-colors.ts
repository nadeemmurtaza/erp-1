import { BRAND } from './brand';

/**
 * The palette — a view onto BRAND.theme.colors.
 *
 * The values moved to brand.ts so a rebrand is one file. This name stays
 * because 119 files import it, and because `THEME_COLORS.accent.DEFAULT`
 * reads better at a call site than reaching through the whole brand object.
 *
 * `neutral` is the entire background/text/border system for admin and
 * storefront both. `accent` is the one brand colour, used sparingly.
 * Error/success/warning use Tailwind's stock red/green/amber — there is no
 * custom token for those, deliberately: they mean the same thing in every
 * brand and should not be something a client can get wrong.
 */
export const THEME_COLORS = BRAND.theme.colors;
export type ThemeColors = typeof THEME_COLORS;

/**
 * The dark palette — the same roles, re-derived for a dark surface (COL-5).
 * `THEME_COLORS` stays the light palette on purpose: 119 files import it, and
 * none of them asked to change. Code that has to pick per theme — a chart, a
 * canvas, React Native — reads `THEME_PALETTES[theme]`.
 */
export const THEME_COLORS_DARK = BRAND.theme.colorsDark;
export type ThemeColorsDark = typeof THEME_COLORS_DARK;

export const THEME_PALETTES = { light: THEME_COLORS, dark: THEME_COLORS_DARK } as const;
