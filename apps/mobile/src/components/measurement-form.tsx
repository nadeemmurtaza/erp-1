import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { validateMeasurements } from '@newax/shared';
import type { MeasurementField } from '../api/types';
import { useI18n } from '../i18n';
import { Field } from './ui';

export interface MeasurementFormState {
  values: Record<string, string>;
  set: (key: string, value: string) => void;
  /** Validated numbers, or null with the offending fields marked. */
  parse: () => Record<string, number> | null;
  invalid: string[];
}

export interface ParseResult {
  values: Record<string, number> | null;
  invalid: string[];
}

/**
 * Turns what was typed into numbers the API will accept — or names the fields
 * that stop it.
 *
 * A plain function rather than part of the hook, so the rule that decides
 * whether a set of measurements is usable can be tested on its own.
 */
export function parseMeasurements(
  fields: MeasurementField[],
  input: Record<string, string>,
): ParseResult {
  const typed: Record<string, number> = {};

  for (const [key, raw] of Object.entries(input)) {
    if (raw.trim() === '') continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) typed[key] = parsed;
  }

  const result = validateMeasurements(fields, typed);
  if (result.valid) return { values: result.values ?? typed, invalid: [] };

  return { values: null, invalid: result.errors.map((issue) => issue.field) };
}

/**
 * Measurement entry, driven by the garment's own fields.
 *
 * Nothing here knows what a kameez needs — the fields are rows in the database,
 * and the numbers are checked with the very same `validateMeasurements` the API
 * uses, so the phone rejects exactly what the server would.
 */
export function useMeasurementForm(
  fields: MeasurementField[],
  initial: Record<string, number> = {},
): MeasurementFormState {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, String(value)])),
  );
  const [invalid, setInvalid] = useState<string[]>([]);

  return useMemo(
    () => ({
      values,
      invalid,
      set: (key, value) => setValues((current) => ({ ...current, [key]: value })),
      parse: () => {
        const result = parseMeasurements(fields, values);
        setInvalid(result.invalid);
        return result.values;
      },
    }),
    [values, invalid, fields],
  );
}

export function MeasurementFields({
  fields,
  form,
}: {
  fields: MeasurementField[];
  form: MeasurementFormState;
}) {
  const { locale } = useI18n();

  return (
    <View>
      {fields.map((field) => (
        <Field
          key={field.id}
          label={`${locale === 'ur' ? field.labelUr : field.labelEn}${field.required ? ' *' : ''}`}
          hint={`${field.unit === 'CM' ? 'cm' : 'in'} · ${field.min}–${field.max}`}
          keyboardType="decimal-pad"
          value={form.values[field.key] ?? ''}
          invalid={form.invalid.includes(field.key)}
          onChangeText={(text) => form.set(field.key, text)}
        />
      ))}
    </View>
  );
}
