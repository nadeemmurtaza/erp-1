import { hexToRgb } from './theme-tailwind';

/**
 * WCAG 2.x contrast, as a function — one implementation for the spec that
 * guards the palette and the reference page that shows it.
 *
 * `scripts/check-contrast.mjs` carries its own copy on purpose: it is a
 * zero-dependency Node script that reads brand.ts as text and cannot import
 * TypeScript. Both are checked against the same published WCAG vectors.
 */

/** Relative luminance of an sRGB colour, 0 (black) to 1 (white). */
export function relativeLuminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, order-independent, 1:1 to 21:1. */
export function contrastRatio(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `fg` at `alpha` over an opaque `bg` — a translucent colour has no contrast of its own until it is composited. */
export function compositeRgb(
  fg: readonly [number, number, number],
  bg: readonly [number, number, number],
  alpha: number,
): [number, number, number] {
  return fg.map((v, i) => v * alpha + bg[i]! * (1 - alpha)) as [number, number, number];
}

/** Same as `contrastRatio`, from hex strings. */
export function contrastRatioHex(a: string, b: string): number {
  return contrastRatio(hexToRgb(a), hexToRgb(b));
}

/** WCAG conformance label for a ratio at a text size. */
export function wcagLevel(ratio: number, large = false): 'AAA' | 'AA' | 'fail' {
  if (ratio >= (large ? 4.5 : 7)) return 'AAA';
  if (ratio >= (large ? 3 : 4.5)) return 'AA';
  return 'fail';
}
