import { BRAND } from './brand';

/**
 * Stacking layers — a view onto BRAND.theme.layers. A `z-index` literal in a
 * component is a bug; web reads these as `z-sticky`, `z-modal`, `z-toast`.
 */
export const THEME_LAYERS = BRAND.theme.layers;
export type Layer = keyof typeof THEME_LAYERS;
