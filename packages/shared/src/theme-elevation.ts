import { BRAND } from './brand';

/**
 * The four elevation steps — a view onto BRAND.theme.elevation. A step is
 * exactly one shadow per theme; nothing composes its own (chapter 01).
 *
 * CSS only. React Native shadows are four separate properties and iOS/Android
 * disagree about them, so mobile keeps its own until its dark pass.
 */
export const THEME_ELEVATION = BRAND.theme.elevation;
export type ElevationStep = keyof typeof THEME_ELEVATION.light;
