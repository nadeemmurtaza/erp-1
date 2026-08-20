import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

/**
 * Muted Slate + Teal palette. Primary slate-teal (#5B6E74) with secondary
 * muted teal (#819FA7). Light blue-gray background (#F3F5F9) and off-white
 * accents (#F2F2F0) for sophisticated, modern aesthetic. Deep black text (#0D0D0D).
 * Kept deliberately small so a later rebrand is a few hex values.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f3f5f9',
          100: '#e1e7ed',
          200: '#c9d4dd',
          300: '#b0c1cc',
          400: '#98aebb',
          500: '#5b6e74',
          600: '#536568',
          700: '#475a5f',
          800: '#3d4f55',
          900: '#0d0d0d',
        },
        sand: {
          50: '#f3f5f9',
          100: '#f2f2f0',
          200: '#e1e7ed',
          300: '#c9d4dd',
          400: '#b0c1cc',
        },
        gold: '#819fa7',
        ink: '#0d0d0d',
      },
      fontFamily: {
        // Noto Nastaliq renders Urdu properly where it is installed; the rest
        // are safe system fallbacks so nothing is fetched at runtime.
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        urdu: ['Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'system-ui', 'sans-serif'],
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
