import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

/**
 * Pacific Cyan + Bone Art Deco palette. Vibrant teal primary (#1B9AAA)
 * with warm bone accents (#DDDBCB). Cream background (#F5F1E3) and pure white
 * for clean luxury. Nearly black text (#050505) for maximum contrast.
 * Kept deliberately small so a later rebrand is a few hex values.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f1e3',
          100: '#e8e4d5',
          200: '#ddd9c7',
          300: '#cfccb3',
          400: '#c0bb9a',
          500: '#1b9aaa',
          600: '#188896',
          700: '#157782',
          800: '#12666e',
          900: '#050505',
        },
        sand: {
          50: '#f8f8f8',
          100: '#ffffff',
          200: '#f0f0f0',
          300: '#e8e8e8',
          400: '#e0e0e0',
        },
        gold: '#dddbcb',
        ink: '#050505',
        /*
         * Storefront reskin palette (monochrome, per the Figma mobile
         * e-commerce reference). Kept separate from `brand`/`sand`/`gold`/
         * `ink` above, which the admin panel's own freshly-rebuilt dashboard
         * depends on by exact name — this scale is for storefront use only.
         * Ramp anchored at 50/900 (page background / near-black text) and
         * 700 (the warm charcoal CTA/bottom-nav fill), with the reference's
         * two named grays (secondary text, muted/border) landing at 500 and
         * 300; the remaining stops are interpolated between those anchors so
         * hover/border/muted-text variants have somewhere sensible to land.
         */
        noir: {
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
        // Star-rating accent — the ONLY spot of color in the storefront
        // reskin. Never use this for anything other than rating stars.
        star: '#F5B841',
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
