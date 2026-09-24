/**
 * The variant matrix builder's cross-product (WO-3.5,
 * docs/implementation/catalog-variants-pricing/03-variants-sku-seo.md). Pure so the editor can
 * generate and preview the matrix client-side before anything is saved.
 */
export interface OptionAxis {
  /** The option's own key, e.g. "size". */
  key: string;
  /** Value keys, in the order they should appear in the matrix, e.g. ["S", "M", "L"]. */
  valueKeys: string[];
}

export interface VariantCombination {
  /** One value key per axis, in the same order as the `axes` passed in. */
  valueKeys: string[];
}

export interface GenerateCombinationsResult {
  combinations: VariantCombination[];
  /** The true cross-product size, even when truncated. */
  total: number;
  /** True when `total` exceeded `maxRows` and no combinations were generated. */
  truncated: boolean;
}

const DEFAULT_MAX_ROWS = 250;

/**
 * The full cross-product of every axis's values. Refuses beyond `maxRows`
 * rather than generating a hung tab — three options with 20 values each is
 * 8,000 variants, not a table.
 */
export function generateVariantCombinations(
  axes: OptionAxis[],
  maxRows = DEFAULT_MAX_ROWS,
): GenerateCombinationsResult {
  if (axes.length === 0 || axes.some((axis) => axis.valueKeys.length === 0)) {
    return { combinations: [], total: 0, truncated: false };
  }

  const total = axes.reduce((product, axis) => product * axis.valueKeys.length, 1);
  if (total > maxRows) {
    return { combinations: [], total, truncated: true };
  }

  let combinations: string[][] = [[]];
  for (const axis of axes) {
    const next: string[][] = [];
    for (const combo of combinations) {
      for (const valueKey of axis.valueKeys) {
        next.push([...combo, valueKey]);
      }
    }
    combinations = next;
  }

  return {
    combinations: combinations.map((valueKeys) => ({ valueKeys })),
    total,
    truncated: false,
  };
}

function comboKey(combo: VariantCombination): string {
  return combo.valueKeys.join('\u0000');
}

/**
 * Combinations in `all` that are not already in `existing` — so adding one
 * new value to an option generates only the new rows and leaves existing
 * variants (their SKUs, stock, everything) exactly as they are.
 */
export function newCombinationsOnly(
  all: VariantCombination[],
  existing: VariantCombination[],
): VariantCombination[] {
  const existingKeys = new Set(existing.map(comboKey));
  return all.filter((combo) => !existingKeys.has(comboKey(combo)));
}

/** Combinations in `existing` that no longer appear in `all` — candidates to deactivate, never delete. */
export function removedCombinations(
  all: VariantCombination[],
  existing: VariantCombination[],
): VariantCombination[] {
  const allKeys = new Set(all.map(comboKey));
  return existing.filter((combo) => !allKeys.has(comboKey(combo)));
}
