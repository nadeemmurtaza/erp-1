import { THEME_COLORS, THEME_RADII, THEME_TYPE } from '@newax/shared';

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
    surface: THEME_COLORS.white,
    danger: '#b91c1c', // Tailwind red-700
    dangerSoft: '#fef2f2', // Tailwind red-50
  },
  space: (units: number) => units * 4,
  /*
   * Same scale the website uses, imported rather than restated. These were
   * 6/10/16 while web had gone to 2/3, so the app read as visibly rounder
   * than the site it belongs to — one product, two shapes. `pill` is not a
   * radius choice: it is how a circle is spelled, and it does not move when
   * the sharpness does.
   */
  radius: {
    sm: THEME_RADII.sharp,
    md: THEME_RADII.sharp,
    lg: THEME_RADII.lg,
    pill: THEME_RADII.pill,
  },
  /*
   * Same scale the website uses, imported rather than picked again. These
   * were 11/13/15/17/22 against web's 12/14/16/20/24 — every step
   * disagreed, and nobody had decided that. Moving up to meet web is the
   * safe direction: a 16px body is what both iOS and Android recommend,
   * and it is what the site already serves a phone.
   *
   * lineHeight is set explicitly because React Native does not derive one,
   * and Nastaliq descenders collide without it.
   */
  text: {
    title: { fontSize: THEME_TYPE.title.size, lineHeight: THEME_TYPE.title.line, fontWeight: '600' as const },
    heading: { fontSize: THEME_TYPE.heading.size, lineHeight: THEME_TYPE.heading.line, fontWeight: '600' as const },
    body: { fontSize: THEME_TYPE.body.size, lineHeight: THEME_TYPE.body.line },
    small: { fontSize: THEME_TYPE.small.size, lineHeight: THEME_TYPE.small.line },
    tiny: { fontSize: THEME_TYPE.tiny.size, lineHeight: THEME_TYPE.tiny.line },
  },
};

export type Theme = typeof theme;
