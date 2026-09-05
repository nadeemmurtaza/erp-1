import { THEME_COLORS } from '@yaseen/shared';

/**
 * The app's colours and spacing, matching the website.
 *
 * `brand`/`ink`/`sand` below are drawn from THEME_COLORS — the same source
 * apps/web's Tailwind config and chart components use — rather than a
 * separate hardcoded approximation, which is what this file used to be:
 * three surfaces each eyeballing "close enough" to the same identity and
 * landing on three slightly different hex values. `gold` and `danger` are
 * pinned to Tailwind's actual `amber-600`/`red-700` (and their `-50`/subtle
 * counterparts) so the app's warning and error colours match the web
 * admin's pixel for pixel — those two are Tailwind stock colors on web, not
 * custom tokens, so there is nothing in THEME_COLORS to import for them.
 */
export const theme = {
  color: {
    brand: THEME_COLORS.accent.DEFAULT,
    brandDark: THEME_COLORS.accent.hover,
    brandSoft: '#e6f4f6',
    gold: '#d97706', // Tailwind amber-600
    ink: THEME_COLORS.neutral[900],
    inkSoft: THEME_COLORS.neutral[600],
    inkFaint: THEME_COLORS.neutral[400],
    sand: THEME_COLORS.neutral[50],
    sandDeep: THEME_COLORS.neutral[100],
    line: THEME_COLORS.neutral[200],
    surface: '#ffffff',
    danger: '#b91c1c', // Tailwind red-700
    dangerSoft: '#fef2f2', // Tailwind red-50
  },
  space: (units: number) => units * 4,
  radius: { sm: 6, md: 10, lg: 16, pill: 999 },
  text: {
    title: { fontSize: 22, fontWeight: '600' as const },
    heading: { fontSize: 17, fontWeight: '600' as const },
    body: { fontSize: 15 },
    small: { fontSize: 13 },
    tiny: { fontSize: 11 },
  },
};

export type Theme = typeof theme;
