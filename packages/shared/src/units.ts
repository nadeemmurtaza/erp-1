/**
 * Raw-material quantities. All stock and cost figures for a `RawMaterial`
 * (bom module, WO-C.1) are integer BASE UNITS, the same discipline money
 * uses in this codebase — never a float display quantity stored directly.
 *
 * `unitScale` says how many base units make one display unit: fabric is
 * GAZ with unitScale 1000, so a stock of 12500 base units is 12.5 gaz and
 * `costPrice` is paisa per milli-gaz. Convert only at the UI boundary,
 * through the three functions below — a bare `stock / unitScale` in a
 * component is a bug this file exists to make unnecessary.
 */

/** Mirrors bom.prisma's `RawMaterialUnit` enum — kept as a literal union here rather than importing the generated Prisma type, so this package never depends on apps/api's client. */
export type RawMaterialUnit = 'GAZ' | 'METRE' | 'PIECE' | 'SPOOL' | 'GRAM' | 'MILLILITRE';

export const UNIT_LABELS: Record<RawMaterialUnit, string> = {
  GAZ: 'gaz',
  METRE: 'metre',
  PIECE: 'piece',
  SPOOL: 'spool',
  GRAM: 'gram',
  MILLILITRE: 'millilitre',
};

/**
 * A display quantity (12.5 gaz) to base units (12500), rounded to the
 * nearest whole base unit — base units are always integers, so a quantity
 * finer than `unitScale` can represent (0.0004 gaz at scale 1000) rounds to
 * 0. That is correct arithmetic; whether 0 is an acceptable thing to store
 * is the caller's call — the raw-material form warns rather than silently
 * accepting it.
 */
export function toBaseUnits(display: number, unitScale: number): number {
  return Math.round(display * unitScale);
}

/** Base units (12500) back to a display quantity (12.5 gaz). */
export function fromBaseUnits(base: number, unitScale: number): number {
  return base / unitScale;
}

/**
 * "12.5 gaz" — only as many decimal places as `unitScale` actually implies
 * (three for scale 1000, none for scale 1), and no trailing zeros beyond
 * what the value needs.
 */
export function formatQuantity(base: number, unitScale: number, unit: RawMaterialUnit): string {
  const display = fromBaseUnits(base, unitScale);
  const maxDecimals = unitScale > 1 ? Math.round(Math.log10(unitScale)) : 0;
  const trimmed = trimTrailingZeros(display.toFixed(maxDecimals));
  return `${trimmed} ${UNIT_LABELS[unit]}`;
}

function trimTrailingZeros(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '');
}
