import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

/**
 * The palette is drawn from Pakistani lawn print traditions: a deep teal
 * (ferozi) as the brand colour, warm sand as the page ground, and a muted gold
 * for accents. Kept deliberately small so a later rebrand is a few hex values.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9fa',
          100: '#d8eef1',
          200: '#b3dde3',
          300: '#81c5cf',
          400: '#4ea6b4',
          500: '#2e8b9a',
          600: '#246f7f',
          700: '#205a68',
          800: '#1f4a56',
          900: '#1d3f49',
        },
        sand: {
          50: '#fbf9f5',
          100: '#f5f0e6',
          200: '#e9e0cd',
          300: '#d9cba9',
          400: '#c4ae7f',
        },
        gold: '#b08d3f',
        ink: '#1c1b19',
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
    },
  },
  plugins: [forms],
} satisfies Config;
