import { BRAND } from './brand';

/**
 * Control heights, icon sizes and touch-target floors — a view onto
 * BRAND.theme.size.
 *
 * Web consumes these as the `control-*`/`touch*` spacing keys (`h-control-md`,
 * `min-h-touch`) so `.btn` and `.field-input` state the floor by name instead
 * of by the number 44 written in four places.
 */
export const THEME_SIZE = BRAND.theme.size;

/**
 * The spacing keys the size tokens generate, with their pixel size: one list
 * for Tailwind (`h-control-md`, `min-h-touch`) and for `cn()`'s merge rules, so
 * the two cannot disagree about which names exist.
 */
export const SIZE_SPACING_PX: Readonly<Record<string, number>> = {
  'control-sm': THEME_SIZE.control.sm,
  'control-md': THEME_SIZE.control.md,
  'control-lg': THEME_SIZE.control.lg,
  'icon-sm': THEME_SIZE.icon.sm,
  'icon-md': THEME_SIZE.icon.md,
  'icon-lg': THEME_SIZE.icon.lg,
  touch: THEME_SIZE.touch.min,
  'touch-pos': THEME_SIZE.touch.pos,
};
