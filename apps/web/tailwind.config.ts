import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';
import colors from 'tailwindcss/colors';
import plugin from 'tailwindcss/plugin';
import { THEME_RADII, TAILWIND_FONT_SIZE, createThemeTailwind, radiusPx } from '@newax/shared';

/**
 * Every colour, shadow, layer, size and motion value below comes from
 * `createThemeTailwind` (packages/shared/src/theme-tailwind.ts), which reads
 * them from brand.ts — this file declares none. It is the same function the
 * POS calls, so both apps resolve the same tokens, in both themes.
 *
 * The four hue scales are passed in because shared has no Tailwind dependency
 * to read them from; they are the only stock hues the product uses.
 */
const theme = createThemeTailwind({
  red: colors.red,
  green: colors.green,
  amber: colors.amber,
  blue: colors.blue,
});

/**
 * One palette for admin and storefront both, in two themes, from brand.ts —
 * that file is also what apps/mobile and the web chart components import, so
 * every surface renders the same values by construction instead of by three
 * people independently eyeballing "close enough".
 *
 * `neutral` (monochrome ramp) is the whole background/text/border system for
 * both admin and storefront. `accent` (`#0e8294`) is the one brand colour,
 * used sparingly for calls to action, links and focus rings. `star` stays
 * reserved for rating stars — never repurpose it. Error/success/warning use
 * Tailwind's stock `red`/`green`/`amber` scales, already used consistently
 * throughout the app; there is no custom token for those.
 *
 * The palette is CLOSED: `colors` replaces Tailwind's rather than extending
 * it, so a hue with no dark value (`text-orange-600`) generates no CSS at all
 * instead of being right in light and wrong in dark. See theme-tailwind.ts.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  /*
   * The dark variant keys off the same attribute the colour tokens do, so a
   * `dark:` utility and a token can never disagree about which theme is live.
   * It is for the rare refinement a token cannot express; reach for a token
   * first. Do not use it inside a region pinned with `data-theme='light'` —
   * the attribute on <html> still matches there.
   */
  darkMode: ['selector', "[data-theme='dark']"],
  theme: {
    colors: theme.colors,
    zIndex: theme.zIndex,
    extend: {
      backgroundColor: theme.backgroundColor,
      borderColor: theme.borderColor,
      gradientColorStops: theme.gradientColorStops,
      boxShadow: theme.boxShadow,
      spacing: theme.spacing,
      transitionDuration: { ...theme.transitionDuration, 250: '250ms' },
      transitionTimingFunction: theme.transitionTimingFunction,
      /*
       * Seven tiers, not Tailwind's five, and the two extra ones are the two
       * the stock scale has no answer for.
       *
       * `xs` (380px) is the floor that actually exists in Pakistan: a Galaxy
       * Z Fold's cover screen is 280px, an iPhone SE is 320px, and plenty of
       * budget Androids are 360px. Everything below `xs` has to work on the
       * base styles alone, so the base layout is the narrow one and each tier
       * adds, never subtracts.
       *
       * `fold` (672px) is the gap that matters most. A Z Fold opened into
       * tablet mode is ~673-717px wide, a Surface Duo spanned across both
       * panels is 720px — all of which land above `sm` (640) and below `md`
       * (768), so with the stock scale an unfolded tablet-sized screen gets
       * the one-column phone layout. Measured: at 717px the home page's hero
       * grid still computed to a single 669px column.
       *
       * The rest are Tailwind's own values, restated here because `screens`
       * inside `extend` merges rather than replaces and listing all seven in
       * order is how the scale stays readable. Tailwind sorts by min-width, so
       * `xs` and `fold` slot in correctly wherever they are written.
       */
      screens: {
        xs: '380px',
        sm: '640px',
        fold: '672px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
      /*
       * The viewport minus the storefront header. Four auth pages each wrote
       * `min-h-[calc(100vh-4rem)]`, which states a header height nothing else
       * knows about — change the header and all four are silently wrong.
       */
      minHeight: {
        auth: 'calc(100vh - theme(spacing.16))',
      },
      fontFamily: {
        // Noto Nastaliq renders Urdu properly where it is installed; the rest
        // are safe system fallbacks so nothing is fetched at runtime.
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        urdu: ['Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'system-ui', 'sans-serif'],
        // Storefront reskin typeface (Encode Sans, loaded via next/font/google
        // in the storefront locale layout as --font-encode-sans). Falls back
        // to the same system stack as `sans` so nothing blocks first paint
        // while the font loads.
        display: [
          'var(--font-encode-sans)',
          'Encode Sans',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      maxWidth: {
        page: '80rem',
      },
      /*
       * Built from packages/shared/src/theme-type.ts rather than left to
       * Tailwind's defaults, so `text-sm` here and `theme.text.small` in
       * apps/mobile resolve to the same number.
       *
       * The values ARE Tailwind's defaults — web already uses these
       * utilities at 817 call sites, so nothing moves on screen. What
       * changes is that mobile can no longer drift away unnoticed, which
       * is exactly what had happened: every step disagreed, 11/13/15/17/22
       * against 12/14/16/20/24.
       */
      fontSize: TAILWIND_FONT_SIZE,
      /*
       * The house shape is square, and this is where that is enforced.
       *
       * `borderRadius` is overridden rather than extended, so every step of
       * the scale — `rounded`, `rounded-md`, `rounded-lg`, `rounded-2xl` —
       * resolves to the same 2px. Three hundred-odd radius utilities were
       * already written across sixty-odd files in four different sizes; this
       * collapses them all without a codemod touching a single call site, and
       * without leaving a `rounded-2xl` somewhere that quietly disagrees with
       * the system next time someone pastes markup in.
       *
       * `full` survives because circles are not a radius choice — avatars,
       * spinners, status dots and the icon buttons over product photography
       * are round by nature, and squaring them would be a bug, not a restyle.
       * `none` survives for deliberate square-off (a cell inside a table).
       */
      borderRadius: {
        none: '0',
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-lg)',
        '2xl': 'var(--radius-lg)',
        '3xl': 'var(--radius-lg)',
        full: '9999px',
      },
      /*
       * Durations and easing come from the motion tokens (brand.ts
       * theme.motion, published as --motion-* by the theme base styles), so
       * refining the motion language is one edit. `normal` (220ms) for a
       * fade or a scale, `slow` (320ms) for anything that travels.
       */
      animation: {
        fadeIn: 'fadeIn var(--motion-duration-normal) var(--motion-easing-standard)',
        slideUp: 'slideUp var(--motion-duration-slow) var(--motion-easing-standard)',
        slideInLeft: 'slideInLeft var(--motion-duration-slow) var(--motion-easing-standard)',
        slideInRight: 'slideInRight var(--motion-duration-slow) var(--motion-easing-standard)',
        scaleIn: 'scaleIn var(--motion-duration-normal) var(--motion-easing-standard)',
        /* The exits of the two drawer entrances above: the same 8px, the other way, at the `fast` exit. */
        slideOutLeft: 'slideOutLeft var(--motion-duration-fast) var(--motion-easing-exit) forwards',
        slideOutRight: 'slideOutRight var(--motion-duration-fast) var(--motion-easing-exit) forwards',
        /*
         * The motion language (docs/design/motion/05-motion.md, "The reel").
         * `arrive` is what a card, a popover or a notice does on first paint:
         * it settles into place. `backwards` fill holds the first frame through
         * any `animation-delay`, so a staggered list never flashes at full
         * opacity before its turn. `leave` is the exit twin and `forwards` so
         * the element stays gone for the frames before it unmounts. `nudge` is
         * the one-shot "look here" a field or an error gives when it turns
         * invalid; it ends where it began, so it never moves layout. Their
         * @keyframes are in globals.css, not here: Tailwind only emits a
         * config keyframe when an `animate-*` class using it is found, and the
         * component classes (`.stagger`, `.notice`, `.field-input`) name these
         * animations from plain CSS.
         */
        arrive: 'arrive var(--motion-duration-normal) var(--motion-easing-settle) backwards',
        leave: 'leave var(--motion-duration-fast) var(--motion-easing-exit) forwards',
        nudge: 'nudge var(--motion-duration-slow) var(--motion-easing-standard)',
        /* Content that has been revealed: a fade and a small rise, the quieter twin of `arrive`. */
        rise: 'slideUp var(--motion-duration-normal) var(--motion-easing-settle) backwards',
        shimmer: 'shimmer 2s infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(var(--motion-distance-small))', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        slideInLeft: {
          from: { transform: 'translateX(calc(var(--motion-distance-small) * -1))', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        slideInRight: {
          from: { transform: 'translateX(var(--motion-distance-small))', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        slideOutLeft: {
          from: { transform: 'translateX(0)', opacity: '1' },
          to: { transform: 'translateX(calc(var(--motion-distance-small) * -1))', opacity: '0' },
        },
        slideOutRight: {
          from: { transform: 'translateX(0)', opacity: '1' },
          to: { transform: 'translateX(var(--motion-distance-small))', opacity: '0' },
        },
        scaleIn: {
          from: { transform: 'scale(var(--motion-scale-arrive))', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
    },
  },
  plugins: [
    forms,
    /*
     * Publishes the radius scale as the custom properties globals.css reads.
     * The numbers come from packages/shared so apps/mobile can import the
     * same ones — a CSS variable is invisible to React Native, which is how
     * the web and the app came to disagree about the house shape in the
     * first place.
     */
    plugin(({ addBase }) => {
      addBase({
        ':root': {
          '--radius': radiusPx(THEME_RADII.sharp),
          '--radius-lg': radiusPx(THEME_RADII.lg),
        },
      });
      // The colour, shadow and motion custom properties, for both themes.
      addBase(theme.baseStyles());
    }),
  ],
} satisfies Config;
