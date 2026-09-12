/**
 * The one set of colour values every surface draws from — web (Tailwind
 * config, admin, storefront) and mobile (React Native inline styles) alike.
 *
 * Before this file, three surfaces each carried their own approximation of
 * the same identity: web admin's `brand`/`sand`/`gold`/`ink` Tailwind scale
 * (teal `#1b9aaa`), web's chart components hardcoding a *different* teal
 * (`#0f8fa3`) inline in five separate files, and the mobile app's
 * `src/theme.ts` hardcoding a third set of near-identical hex values under
 * its own names. None of the three agreed, because none of them imported
 * from the others — each was someone eyeballing "close enough" rather than
 * reusing a value. Import from here instead of writing a hex literal.
 *
 * `neutral` is the monochrome ramp (backgrounds, text, borders, chart
 * tracks) used everywhere — there is no separate palette for admin vs
 * storefront. `accent` is the one brand colour, used sparingly for calls to
 * action, links and focus rings. `star` stays reserved for rating stars only
 * (see its use sites) — never repurpose it for anything else, the same way
 * you would not repurpose a semantic error colour for a decorative accent.
 *
 * Semantic status colours (error, success, warning) are NOT here: the app
 * already uses Tailwind's stock `red`/`green`/`amber` scales for those
 * consistently, and inventing custom ones would just be a second red to keep
 * in sync with the first. Mobile's `danger` in `apps/mobile/src/theme.ts`
 * is pinned to Tailwind's actual `red-700`/`red-50` hex for the same reason.
 */
export const THEME_COLORS = {
  neutral: {
    50: '#F2F2F2',
    100: '#E8E8E8',
    200: '#C6C5C5',
    300: '#A3A1A2',
    400: '#8E8C8C',
    500: '#787676',
    600: '#514E4E',
    700: '#292526',
    800: '#1E1B1C',
    900: '#121111',
  },
  accent: {
    DEFAULT: '#0f8fa3',
    hover: '#0b6d7d',
  },
  /**
   * The surface every card, header and sidebar sits on, and the text colour on
   * top of a filled accent button. Named rather than left as a `#ffffff`
   * literal because the places that need it as a *value* — the two error
   * routes that render before any stylesheet loads, and the chart that draws
   * gaps between slices — were each spelling it out for themselves.
   */
  white: '#ffffff',
  /** Rating stars only. */
  star: '#F5B841',
} as const;
