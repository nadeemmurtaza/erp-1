import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';
import plugin from 'tailwindcss/plugin';
import { THEME_COLORS, THEME_RADII, radiusPx } from '@yaseen/shared';

/**
 * One palette for admin and storefront both, imported from
 * packages/shared/src/theme-colors.ts rather than declared here — that file
 * is also what apps/mobile and the web chart components import, so every
 * surface renders the same hex values by construction instead of by three
 * people independently eyeballing "close enough".
 *
 * `neutral` (monochrome ramp) is the whole background/text/border system for
 * both admin and storefront. `accent` (`#0f8fa3`) is the one brand colour,
 * used sparingly for calls to action, links and focus rings. `star` stays
 * reserved for rating stars — never repurpose it. Error/success/warning use
 * Tailwind's stock `red`/`green`/`amber` scales, already used consistently
 * throughout the app; there is no custom token for those.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
      colors: {
        neutral: THEME_COLORS.neutral,
        accent: THEME_COLORS.accent,
        star: THEME_COLORS.star,
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
      animation: {
        fadeIn: 'fadeIn 200ms ease-out',
        slideUp: 'slideUp 300ms ease-out',
        slideInLeft: 'slideInLeft 300ms ease-out',
        slideInRight: 'slideInRight 300ms ease-out',
        scaleIn: 'scaleIn 200ms ease-out',
        shimmer: 'shimmer 2s infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        slideInLeft: {
          from: { transform: 'translateX(-8px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        slideInRight: {
          from: { transform: 'translateX(8px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          from: { transform: 'scale(0.95)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      transitionDuration: {
        250: '250ms',
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
    }),
  ],
} satisfies Config;
