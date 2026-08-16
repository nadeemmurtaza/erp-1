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
  helpEn?: string;
  helpUr?: string;
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
