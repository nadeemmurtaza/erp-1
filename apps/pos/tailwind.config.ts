import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import { THEME_COLORS, THEME_RADII, TAILWIND_FONT_SIZE, radiusPx } from '@newax/shared';

/**
 * Same tokens apps/web and apps/mobile already share — colours, type scale
 * and radius all come from packages/shared rather than being declared here,
 * so a rebrand or a redesign changes one file and every surface, this till
 * included, moves together (CLAUDE.md's "no hardcoding" law).
 *
 * The seven-tier screens grid apps/web defines (down to a 280px fold cover)
 * is NOT repeated here on purpose: a till runs on known hardware — a fixed
 * Windows monitor, an Android tablet, a laptop (RETAIL-ERP.md) — never a
 * phone in someone's pocket, so Tailwind's stock `sm`/`md`/`lg`/`xl` cover
 * the real device range this app ships to.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        neutral: THEME_COLORS.neutral,
        accent: THEME_COLORS.accent,
        feedback: THEME_COLORS.feedback,
      },
      fontSize: TAILWIND_FONT_SIZE,
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
    },
  },
  plugins: [
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
