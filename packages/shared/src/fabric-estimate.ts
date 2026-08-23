/**
 * Fabric yardage estimator, per the tailor's Tech-Pack benchmarks.
 *
 * The storefront shows a "how much fabric will this take" estimate as soon as
 * a customer has picked a garment and entered a couple of measurements, so the
 * arithmetic needs to run client-side without a round trip — hence a pure
 * function here rather than an API call. `fabric-estimate.spec.ts` is the guard.
 */

export interface FabricEstimateInput {
  /** GarmentType.baseFabricGaz — the flat PDF benchmark, used when there isn't enough measurement detail to run the shirt formula. */
  garmentBaseGaz: number | null;
  /** From measurementValues, if the garment has a length-like field. */
  lengthInches?: number;
  /** From measurementValues, if the garment has a sleeve-like field. */
  sleeveLengthInches?: number;
  chestInches?: number;
  hipsInches?: number;
  /** Product.fabric free text, e.g. "lawn", "chiffon". */
  fabricType?: string | null;
  /** Customer-declared 54-60" roll, vs. the standard 36" the benchmarks assume. */
  wideWidth?: boolean;
}

export interface FabricEstimateResult {
  estimatedGaz: number;
  estimatedMetres: number;
  warnings: string[];
}

const GAZ_TO_METRES = 0.9144;
const WIDE_WIDTH_DISCOUNT_GAZ = 0.75;
const PLUS_SIZE_TRIGGER_INCHES = 42;
const PLUS_SIZE_EXTRA_GAZ = 0.5;
const SHRINKAGE_EXTRA_GAZ = 0.25;
const SHRINKAGE_FABRICS = ['cotton', 'linen', 'lawn'];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeFabricEstimate(input: FabricEstimateInput): FabricEstimateResult {
  const warnings: string[] = [];

  // Prefer the shirt formula: it reads the customer's own measurements, so it's
  // more accurate than the flat per-garment benchmark. Both a length and a
  // sleeve length are required inputs to the formula, so fall back otherwise.
  let estimatedGaz: number;
  if (input.lengthInches !== undefined && input.sleeveLengthInches !== undefined) {
    estimatedGaz = ((input.lengthInches + 3) * 2 + (input.sleeveLengthInches + 2)) / 36;
  } else if (input.garmentBaseGaz !== null) {
    estimatedGaz = input.garmentBaseGaz;
  } else {
    estimatedGaz = 0;
    warnings.push('No length/sleeve measurements or base fabric benchmark available — fabric estimate could not be calculated.');
  }

  // Wide rolls (54-60") cover more of the pattern per running yard than the
  // standard 36" the benchmarks assume, so less length is needed.
  if (input.wideWidth) {
    estimatedGaz -= WIDE_WIDTH_DISCOUNT_GAZ;
  }

  // Above this bust/hip size, panels need cross-width joining to fit, which
  // consumes extra fabric.
  if (
    (input.chestInches !== undefined && input.chestInches > PLUS_SIZE_TRIGGER_INCHES) ||
    (input.hipsInches !== undefined && input.hipsInches > PLUS_SIZE_TRIGGER_INCHES)
  ) {
    estimatedGaz += PLUS_SIZE_EXTRA_GAZ;
    warnings.push(
      'Custom panel slicing requires cross-width joining. Provide an additional 0.5 Gaz of fabric.',
    );
  }

  // Cotton, linen and lawn shrink on their first wash, so the cut needs a buffer.
  const fabricType = input.fabricType?.toLowerCase() ?? '';
  if (SHRINKAGE_FABRICS.some((fabric) => fabricType.includes(fabric))) {
    estimatedGaz += SHRINKAGE_EXTRA_GAZ;
    warnings.push(
      'This fabric may shrink after washing. Preshrink before cutting, or keep this extra buffer.',
    );
  }

  // A discount-heavy adjustment (e.g. wide-width on a short garment) must
  // never push the estimate below zero.
  estimatedGaz = Math.max(0, estimatedGaz);

  return {
    estimatedGaz: round2(estimatedGaz),
    estimatedMetres: round2(estimatedGaz * GAZ_TO_METRES),
    warnings,
  };
}
