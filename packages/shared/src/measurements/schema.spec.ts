import { convertMeasurement, validateMeasurements } from './schema';
import { DEFAULT_GARMENT_TYPES, findGarmentDef } from './defaults';
import type { MeasurementFieldDef } from './types';

const kameez = findGarmentDef('kameez');

function fieldsOf(key: string): MeasurementFieldDef[] {
  const garment = findGarmentDef(key);
  if (!garment) throw new Error(`missing garment definition: ${key}`);
  return garment.fields;
}

describe('default garment definitions', () => {
  it('ships the garments a Pakistani tailor needs', () => {
    expect(DEFAULT_GARMENT_TYPES.map((g) => g.key)).toEqual(
      expect.arrayContaining(['kameez', 'shalwar', 'trouser', 'kurta']),
    );
  });

  it('gives every field an Urdu label, since the storefront is bilingual', () => {
    for (const garment of DEFAULT_GARMENT_TYPES) {
      expect(garment.labelUr.length).toBeGreaterThan(0);
      for (const field of garment.fields) {
        expect(field.labelUr.length).toBeGreaterThan(0);
      }
    }
  });

  it('uses unique field keys within each garment', () => {
    for (const garment of DEFAULT_GARMENT_TYPES) {
      const keys = garment.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('defines sane bounds', () => {
    for (const garment of DEFAULT_GARMENT_TYPES) {
      for (const field of garment.fields) {
        expect(field.min).toBeLessThan(field.max);
        expect(field.min).toBeGreaterThan(0);
      }
    }
  });
});

describe('validateMeasurements', () => {
  const validKameez = {
    length: 42,
    chest: 38,
    waist: 34,
    hips: 40,
    shoulder: 15,
    sleeve_length: 22,
    sleeve_opening: 10,
  };

  it('accepts a complete, in-range set', () => {
    const result = validateMeasurements(fieldsOf('kameez'), validKameez);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.values).toEqual(validKameez);
  });

  it('accepts optional fields being present', () => {
    const result = validateMeasurements(fieldsOf('kameez'), {
      ...validKameez,
      armhole: 18,
      neck_front: 8.5,
    });
    expect(result.valid).toBe(true);
  });

  it('reports every missing required field, not just the first', () => {
    const result = validateMeasurements(fieldsOf('kameez'), { length: 42 });
    expect(result.valid).toBe(false);
    const missing = result.errors.map((e) => e.field);
    expect(missing).toEqual(
      expect.arrayContaining(['chest', 'waist', 'hips', 'shoulder', 'sleeve_length']),
    );
  });

  it('rejects a value below the minimum', () => {
    const result = validateMeasurements(fieldsOf('kameez'), { ...validKameez, chest: 4 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.field).toBe('chest');
  });

  it('rejects a value above the maximum — a fat-fingered 380 instead of 38', () => {
    const result = validateMeasurements(fieldsOf('kameez'), { ...validKameez, chest: 380 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.field).toBe('chest');
  });

  it('rejects precision finer than a quarter inch', () => {
    const result = validateMeasurements(fieldsOf('kameez'), {
      ...validKameez,
      chest: 38.3,
    });
    expect(result.valid).toBe(false);
  });

  it('accepts quarter-inch steps', () => {
    expect(
      validateMeasurements(fieldsOf('kameez'), { ...validKameez, chest: 38.25 }).valid,
    ).toBe(true);
  });

  it('rejects an unknown key rather than silently dropping it', () => {
    const result = validateMeasurements(fieldsOf('kameez'), {
      ...validKameez,
      shoulderr: 15,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects a string where a number belongs', () => {
    const result = validateMeasurements(fieldsOf('kameez'), { ...validKameez, chest: '38' });
    expect(result.valid).toBe(false);
  });

  it('validates shalwar independently of kameez', () => {
    const result = validateMeasurements(fieldsOf('shalwar'), {
      length: 40,
      waist: 34,
      hips: 42,
      bottom: 14,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects kameez values submitted against shalwar fields', () => {
    expect(validateMeasurements(fieldsOf('shalwar'), validKameez).valid).toBe(false);
  });

  it('rejects a non-object payload', () => {
    expect(validateMeasurements(fieldsOf('kameez'), null).valid).toBe(false);
    expect(validateMeasurements(fieldsOf('kameez'), 'oops').valid).toBe(false);
  });

  it('names the offending field in the error, for a usable form message', () => {
    const result = validateMeasurements(fieldsOf('kameez'), { ...validKameez, hips: 2 });
    expect(result.errors[0]?.message).toContain('Hips');
  });
});

describe('convertMeasurement', () => {
  it('converts inches to centimetres', () => {
    expect(convertMeasurement(40, 'INCH', 'CM')).toBe(101.5);
  });

  it('converts centimetres to inches', () => {
    expect(convertMeasurement(101.6, 'CM', 'INCH')).toBe(40);
  });

  it('is a no-op when the units match', () => {
    expect(convertMeasurement(38.5, 'INCH', 'INCH')).toBe(38.5);
  });
});

describe('kameez definition', () => {
  it('orders fields for the form top to bottom', () => {
    const orders = kameez!.fields.map((f) => f.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});
