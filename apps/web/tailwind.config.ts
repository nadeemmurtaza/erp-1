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
          50: '#f5f1e3',
          100: '#ffffff',
          200: '#e8e4d5',
          300: '#ddd9c7',
          400: '#dddbcb',
        },
        gold: '#dddbcb',
        ink: '#050505',
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
