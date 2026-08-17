import type { MeasurementField } from '../../api/types';
import { parseMeasurements } from '../measurement-form';

function field(overrides: Partial<MeasurementField> & { key: string }): MeasurementField {
  return {
    id: overrides.key,
    labelEn: overrides.key,
    labelUr: overrides.key,
    unit: 'INCH',
    min: 10,
    max: 60,
    required: true,
    order: 1,
    helpEn: null,
    helpUr: null,
    ...overrides,
  };
}

const FIELDS: MeasurementField[] = [
  field({ key: 'length', labelEn: 'Length', min: 30, max: 60 }),
  field({ key: 'chest', labelEn: 'Chest', min: 24, max: 60, order: 2 }),
  field({
    key: 'sleeve_opening',
    labelEn: 'Sleeve opening',
    min: 6,
    max: 20,
    required: false,
    order: 3,
  }),
];

describe('reading measurements off the form', () => {
  it('accepts a complete, in-range set', () => {
    const result = parseMeasurements(FIELDS, { length: '42', chest: '38' });

    expect(result.values).toEqual({ length: 42, chest: 38 });
    expect(result.invalid).toEqual([]);
  });

  it('refuses a figure outside the garment’s range, and names it', () => {
    const result = parseMeasurements(FIELDS, { length: '420', chest: '38' });

    expect(result.values).toBeNull();
    expect(result.invalid).toContain('length');
  });

  it('refuses a missing required measurement', () => {
    const result = parseMeasurements(FIELDS, { length: '42' });

    expect(result.values).toBeNull();
    expect(result.invalid).toContain('chest');
  });

  it('lets an optional measurement be left blank', () => {
    const result = parseMeasurements(FIELDS, {
      length: '42',
      chest: '38',
      sleeve_opening: '',
    });

    expect(result.values).not.toBeNull();
    expect(result.values).not.toHaveProperty('sleeve_opening');
  });

  it('refuses a measurement finer than a tailor works to', () => {
    // The shared validator allows quarter-inch steps and nothing finer. The
    // phone must reject exactly what the API would, or the customer finds out
    // at the wrong moment.
    const result = parseMeasurements(FIELDS, { length: '42.1', chest: '38' });

    expect(result.values).toBeNull();
    expect(result.invalid).toContain('length');
  });

  it('accepts a quarter-inch step', () => {
    const result = parseMeasurements(FIELDS, { length: '42.25', chest: '38' });

    expect(result.values).toEqual({ length: 42.25, chest: 38 });
  });

  it('treats a typo as a missing value rather than as zero', () => {
    // Number('') is 0, which would silently become a 0-inch chest.
    const result = parseMeasurements(FIELDS, { length: '42', chest: 'abc' });

    expect(result.values).toBeNull();
    expect(result.invalid).toContain('chest');
  });
});
