import type { AdminGarmentSizeChartRow, GarmentType, MeasurementFieldRow } from '@/types/api';

/**
 * Turning a garment into form state, and back.
 *
 * These lived inside the one page that edited garments. Splitting the list
 * from the editor gave them two callers, which is the moment they stop being
 * page detail and become a shared contract — the list shows a garment's
 * measurement count and fee, the editor drafts every field of it, and both
 * have to agree on what those mean.
 *
 * Everything here is a string because that is what a number input holds. The
 * conversions at the edges — rupees to paisa, blank to undefined — are the
 * whole reason this is a draft type and not the API type.
 */

export interface FieldDraft {
  key: string;
  labelEn: string;
  labelUr: string;
  unit: 'INCH' | 'CM';
  min: string;
  max: string;
  required: boolean;
  isActive: boolean;
}

export const SIZE_TOKENS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type SizeToken = (typeof SIZE_TOKENS)[number];

/** Every cell as a string, matching how these forms drive number inputs. */
export type SizeChartDraft = Record<SizeToken, Record<string, string>>;

/**
 * The admin list endpoint (GET /admin/measurements/garment-types) doesn't
 * include the sizeChart relation — only the public storefront endpoint does.
 * It stays declared, optionally, so this picks it up for free the day that
 * changes; until then it is always undefined and every read is guarded.
 */
export type GarmentWithSizeChart = GarmentType & { sizeChart?: AdminGarmentSizeChartRow[] };

export function toDraft(field: MeasurementFieldRow): FieldDraft {
  return {
    key: field.key,
    labelEn: field.labelEn,
    labelUr: field.labelUr,
    unit: field.unit,
    min: String(field.min),
    max: String(field.max),
    required: field.required,
    isActive: field.isActive,
  };
}

export function emptySizeChart(): SizeChartDraft {
  return { XS: {}, S: {}, M: {}, L: {}, XL: {}, XXL: {} };
}

/** Every value stringified for the number inputs; missing rows stay empty. */
export function toSizeChartDraft(rows: AdminGarmentSizeChartRow[] | undefined): SizeChartDraft {
  const draft = emptySizeChart();
  for (const row of rows ?? []) {
    draft[row.sizeToken] = Object.fromEntries(
      Object.entries(row.values).map(([key, value]) => [key, String(value)]),
    );
  }
  return draft;
}

export function splitAliases(value: string): string[] {
  return value
    .split(',')
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);
}
