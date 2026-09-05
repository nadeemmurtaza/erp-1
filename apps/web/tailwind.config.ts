import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';
import { THEME_COLORS } from '@yaseen/shared';

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
  plugins: [forms],
} satisfies Config;
