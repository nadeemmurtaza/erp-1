import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

/**
 * Deep Emerald + Cream luxury palette. Primary brand shifted to deep emerald
 * (#1B4D3E) with gold accents (#D4A574). Maintains warm sand ground for elegance.
 * Kept deliberately small so a later rebrand is a few hex values.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7f6',
          100: '#d8ebe8',
          200: '#b3dbd4',
          300: '#81c3b3',
          400: '#4ea698',
          500: '#1b4d3e',
          600: '#163d33',
          700: '#122f29',
          800: '#0f2420',
          900: '#0a1815',
        },
        sand: {
          50: '#fbf9f5',
          100: '#f5f0e6',
          200: '#e9e0cd',
          300: '#d9cba9',
          400: '#c4ae7f',
        },
        gold: '#d4a574',
        ink: '#0f1419',
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
