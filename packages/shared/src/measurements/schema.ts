import { z } from 'zod';
import type { MeasurementFieldDef, MeasurementValues } from './types';

/**
 * Builds a Zod schema from a garment's measurement field definitions.
 *
 * The API, the website and the mobile app all call this, so a value that is
 * accepted in one place is accepted everywhere and a value rejected in one is
 * rejected everywhere — there is exactly one implementation of the rules.
 */
export function buildMeasurementSchema(
  fields: MeasurementFieldDef[],
): z.ZodType<MeasurementValues> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let value = z
      .number({
        required_error: `${field.labelEn} is required`,
        invalid_type_error: `${field.labelEn} must be a number`,
      })
      .min(field.min, `${field.labelEn} must be at least ${field.min}`)
      .max(field.max, `${field.labelEn} must be at most ${field.max}`);

    // Quarter-inch / half-centimetre precision is as fine as a tailor works.
    value = value.multipleOf(0.25, `${field.labelEn} must be in steps of 0.25`);

    shape[field.key] = field.required ? value : value.optional();
  }

  // `strict` so a typo'd key is an error rather than a silently ignored value.
  return z.object(shape).strict() as unknown as z.ZodType<MeasurementValues>;
}

export interface MeasurementValidationError {
  field: string;
  message: string;
}

export interface MeasurementValidationResult {
  valid: boolean;
  errors: MeasurementValidationError[];
  values?: MeasurementValues;
}

/** Validates raw input against a garment's fields, returning readable errors. */
export function validateMeasurements(
  fields: MeasurementFieldDef[],
  input: unknown,
): MeasurementValidationResult {
  const result = buildMeasurementSchema(fields).safeParse(input);

  if (result.success) {
    return { valid: true, errors: [], values: result.data };
  }

  return {
    valid: false,
    errors: result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '_',
      message: issue.message,
    })),
  };
}

const INCHES_PER_CM = 0.393700787;

/** Converts a value between inches and centimetres, rounded to 0.25 steps. */
export function convertMeasurement(
  value: number,
  from: 'INCH' | 'CM',
  to: 'INCH' | 'CM',
): number {
  if (from === to) return value;
  const converted = from === 'CM' ? value * INCHES_PER_CM : value / INCHES_PER_CM;
  return Math.round(converted * 4) / 4;
}
