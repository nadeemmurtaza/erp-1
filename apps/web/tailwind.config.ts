import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

/**
 * Minimalist Grayscale + Taupe palette. Dark blue-gray primary (#0F1B27)
 * with warm taupe accents (#BFAFAF). Clean light gray background (#F2F2F2)
 * for contemporary luxury aesthetic. Kept deliberately small so a later rebrand
 * is a few hex values.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f2f2',
          100: '#e6e6e6',
          200: '#d9d9d9',
          300: '#b3b3b3',
          400: '#808080',
          500: '#0f1b27',
          600: '#0d1621',
          700: '#0a1019',
          800: '#080d12',
          900: '#0d0d0d',
        },
        sand: {
          50: '#f2f2f2',
          100: '#e6e6e6',
          200: '#d9d9d9',
          300: '#cccccc',
          400: '#b3b3b3',
        },
        gold: '#bfafaf',
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
