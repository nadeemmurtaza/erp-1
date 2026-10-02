import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { SIZE_SPACING_PX, THEME_ELEVATION, THEME_LAYERS, THEME_MOTION } from '@newax/shared';

/**
 * `twMerge`, taught the names the design system adds. Without this it does not
 * know `z-toast`, `shadow-raised`, `min-h-touch`, `duration-fast` or
 * `text-metric`, so it neither de-duplicates two of them nor — worse — mistakes
 * `text-metric` for a text *colour* and silently drops the one real colour next
 * to it. The names come from the same token lists Tailwind is built from, so
 * they cannot drift.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['metric'],
      shadow: Object.keys(THEME_ELEVATION.light),
      ease: Object.keys(THEME_MOTION.easing),
      spacing: Object.keys(SIZE_SPACING_PX),
    },
    classGroups: {
      z: [{ z: Object.keys(THEME_LAYERS) }],
      duration: [{ duration: Object.keys(THEME_MOTION.duration) }],
    },
  },
});

/**
 * Joins class names and resolves Tailwind conflicts, last one winning.
 *
 * `clsx` alone cannot do the second half. Given `cn('px-4', 'px-6')` it
 * returns BOTH classes, and which one paints is then decided by their order
 * in the generated stylesheet rather than by the order you wrote them — so a
 * component that accepts a `className` override appears to ignore it, at
 * random, depending on how Tailwind happened to sort that pair. `twMerge`
 * drops the losing class so the override always wins.
 *
 * Use this anywhere a component takes a `className` prop it merges with its
 * own defaults. Plain `clsx` is still fine for purely conditional class sets
 * that cannot collide (`clsx(isOpen && 'block')`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
