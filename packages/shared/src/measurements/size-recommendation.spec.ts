import { recommendSize, type SizeChartRow } from './size-recommendation';
import type { MeasurementFieldDef } from './types';

const fields: MeasurementFieldDef[] = [
  { key: 'chest', labelEn: 'Chest', labelUr: 'چھاتی', unit: 'INCH', min: 30, max: 50, required: true, order: 1 },
  { key: 'length', labelEn: 'Length', labelUr: 'لمبائی', unit: 'INCH', min: 24, max: 60, required: true, order: 2 },
];

const chart: SizeChartRow[] = [
  { sizeToken: 'S', values: { chest: 36, length: 40 } },
  { sizeToken: 'M', values: { chest: 40, length: 42 } },
  { sizeToken: 'L', values: { chest: 44, length: 44 } },
  { sizeToken: 'XL', values: { chest: 48, length: 46 } },
];

describe('recommendSize', () => {
  it('picks the size chart row closest to the saved measurements', () => {
    const result = recommendSize({
      fields,
      profile: { chest: 40.5, length: 42 },
      chart,
      availableSizeTokens: ['S', 'M', 'L', 'XL'],
    });

    expect(result?.recommendedSize).toBe('M');
    expect(result?.matchedSize).toBe('M');
  });

  it('reports high confidence when one size is clearly closer than the next', () => {
    const result = recommendSize({
      fields,
      profile: { chest: 40, length: 42 },
      chart,
      availableSizeTokens: ['S', 'M', 'L', 'XL'],
    });

    expect(result?.confidence).toBe('high');
  });

  it('reports low confidence for a measurement sitting almost exactly between two sizes', () => {
    const result = recommendSize({
      fields,
      profile: { chest: 42, length: 43 }, // exactly halfway between M and L
      chart,
      availableSizeTokens: ['S', 'M', 'L', 'XL'],
    });

    expect(result?.confidence).toBe('low');
  });

  it('shifts the recommendation up a size when biasShift is +1', () => {
    const result = recommendSize({
      fields,
      profile: { chest: 40, length: 42 }, // matches M exactly
      chart,
      availableSizeTokens: ['S', 'M', 'L', 'XL'],
      biasShift: 1,
    });

    expect(result?.matchedSize).toBe('M');
    expect(result?.recommendedSize).toBe('L');
    expect(result?.shiftedForFit).toBe('up');
  });

  it('shifts the recommendation down a size when biasShift is -1', () => {
    const result = recommendSize({
      fields,
      profile: { chest: 40, length: 42 },
      chart,
      availableSizeTokens: ['S', 'M', 'L', 'XL'],
      biasShift: -1,
    });

    expect(result?.recommendedSize).toBe('S');
    expect(result?.shiftedForFit).toBe('down');
  });

  it('never shifts past the largest token when the match is already at the edge', () => {
    const edgeChart: SizeChartRow[] = [...chart, { sizeToken: 'XXL', values: { chest: 52, length: 48 } }];

    const result = recommendSize({
      fields,
      profile: { chest: 52, length: 48 }, // matches XXL exactly — nothing larger exists
      chart: edgeChart,
      availableSizeTokens: ['S', 'M', 'L', 'XL', 'XXL'],
      biasShift: 1,
    });

    expect(result?.matchedSize).toBe('XXL');
    expect(result?.recommendedSize).toBe('XXL');
  });

  it('falls back to the nearest size this product actually sells when the match is unavailable', () => {
    const result = recommendSize({
      fields,
      profile: { chest: 36, length: 40 }, // matches S exactly
      chart,
      availableSizeTokens: ['M', 'L'], // S and XL aren't sold
    });

    expect(result?.matchedSize).toBe('S');
    expect(result?.recommendedSize).toBe('M');
    expect(result?.unavailableFallback).toBe(true);
  });

  it('returns null when the product has no size chart at all', () => {
    const result = recommendSize({
      fields,
      profile: { chest: 40, length: 42 },
      chart: [],
      availableSizeTokens: ['S', 'M', 'L'],
    });

    expect(result).toBeNull();
  });

  it('returns null when the product sells no recognizable size token', () => {
    const result = recommendSize({
      fields,
      profile: { chest: 40, length: 42 },
      chart,
      availableSizeTokens: ['Free Size'],
    });

    expect(result).toBeNull();
  });

  it('returns null when the profile shares no measurement field with any chart row', () => {
    const result = recommendSize({
      fields: [{ key: 'sleeve', labelEn: 'Sleeve', labelUr: 'آستین', unit: 'INCH', min: 10, max: 30, required: true, order: 1 }],
      profile: { sleeve: 22 },
      chart, // only has chest/length, never sleeve
      availableSizeTokens: ['S', 'M', 'L', 'XL'],
    });

    expect(result).toBeNull();
  });

  it('compares only the fields both the profile and a given chart row actually have, since a size row may cover a subset', () => {
    const partialChart: SizeChartRow[] = [
      { sizeToken: 'S', values: { chest: 36 } }, // no length on this row
      { sizeToken: 'M', values: { chest: 40, length: 42 } },
    ];

    const result = recommendSize({
      fields,
      profile: { chest: 40, length: 42 },
      chart: partialChart,
      availableSizeTokens: ['S', 'M'],
    });

    expect(result?.recommendedSize).toBe('M');
  });
});
