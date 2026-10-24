import type { MeasurementUnit } from '../enums';

/**
 * A single measurement a tailor needs, e.g. "chest" or "sleeve length".
 *
 * These are rows in the database, not constants in code, so staff can add a
 * measurement from the admin dashboard without a deploy. The definitions in
 * `defaults.ts` are only the starting set loaded by the seed.
 */
export interface MeasurementFieldDef {
  /** Stable machine key, snake_case, unique within its garment type. */
  key: string;
  labelEn: string;
  labelUr: string;
  unit: MeasurementUnit;
  /** Inclusive bounds, expressed in `unit`. Reject obvious data-entry errors. */
  min: number;
  max: number;
  required: boolean;
  /** Display order within the garment's form. */
  order: number;
  /**
   * Nullable rather than merely optional: these are database columns, and the
   * API hands them back as `null`. Accepting that shape here means callers can
   * pass a row straight through instead of scrubbing it first.
   */
  helpEn?: string | null;
  helpUr?: string | null;
}

export interface GarmentTypeDef {
  /** Stable machine key, e.g. "kameez". */
  key: string;
  labelEn: string;
  labelUr: string;
  order: number;
  fields: MeasurementFieldDef[];
}

/** A filled-in set of measurements: field key -> value in that field's unit. */
export type MeasurementValues = Record<string, number>;

/** The RTW size tokens a garment's size chart offers, XS through XXL. */
export const GARMENT_SIZE_TOKENS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type GarmentSizeToken = (typeof GARMENT_SIZE_TOKENS)[number];
