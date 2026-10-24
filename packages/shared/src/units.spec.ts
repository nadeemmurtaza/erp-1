import { formatQuantity, fromBaseUnits, toBaseUnits, UNIT_LABELS } from './units';

describe('toBaseUnits', () => {
  it('scales a display quantity up to base units, rounded', () => {
    expect(toBaseUnits(12.5, 1000)).toBe(12500);
    expect(toBaseUnits(5, 1)).toBe(5);
  });

  it('rounds a quantity finer than the scale can represent down to zero', () => {
    expect(toBaseUnits(0.0004, 1000)).toBe(0);
  });

  it('rounds to the nearest base unit rather than truncating', () => {
    expect(toBaseUnits(1.2345, 1000)).toBe(1235); // 1234.5 rounds up
    expect(toBaseUnits(1.2344, 1000)).toBe(1234);
  });
});

describe('fromBaseUnits', () => {
  it('is the exact inverse of toBaseUnits for values the scale represents exactly', () => {
    expect(fromBaseUnits(12500, 1000)).toBe(12.5);
    expect(fromBaseUnits(5, 1)).toBe(5);
  });
});

describe('formatQuantity', () => {
  it('shows only the decimals the scale implies', () => {
    expect(formatQuantity(12500, 1000, 'GAZ')).toBe('12.5 gaz');
    expect(formatQuantity(5, 1, 'PIECE')).toBe('5 piece');
  });

  it('trims trailing zeros without leaving a bare decimal point', () => {
    expect(formatQuantity(12000, 1000, 'GAZ')).toBe('12 gaz');
    expect(formatQuantity(1, 1000, 'GAZ')).toBe('0.001 gaz');
  });

  it('has a label for every RawMaterialUnit', () => {
    expect(Object.keys(UNIT_LABELS).sort()).toEqual(
      ['GAZ', 'METRE', 'PIECE', 'SPOOL', 'GRAM', 'MILLILITRE'].sort(),
    );
  });
});
