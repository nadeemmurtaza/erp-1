import { generateVariantCombinations, newCombinationsOnly, removedCombinations } from './variant-matrix';

describe('generateVariantCombinations', () => {
  it('crosses two axes fully', () => {
    const result = generateVariantCombinations([
      { key: 'size', valueKeys: ['S', 'M'] },
      { key: 'color', valueKeys: ['RED', 'BLU'] },
    ]);
    expect(result.truncated).toBe(false);
    expect(result.total).toBe(4);
    expect(result.combinations).toEqual([
      { valueKeys: ['S', 'RED'] },
      { valueKeys: ['S', 'BLU'] },
      { valueKeys: ['M', 'RED'] },
      { valueKeys: ['M', 'BLU'] },
    ]);
  });

  it('returns nothing for a single axis with no values, or no axes at all', () => {
    expect(generateVariantCombinations([]).combinations).toEqual([]);
    expect(generateVariantCombinations([{ key: 'size', valueKeys: [] }]).combinations).toEqual([]);
  });

  it('refuses beyond the cap rather than generating a hung tab', () => {
    const axes = [
      { key: 'a', valueKeys: Array.from({ length: 20 }, (_, i) => `a${i}`) },
      { key: 'b', valueKeys: Array.from({ length: 20 }, (_, i) => `b${i}`) },
      { key: 'c', valueKeys: Array.from({ length: 20 }, (_, i) => `c${i}`) },
    ];
    const result = generateVariantCombinations(axes, 250);
    expect(result.total).toBe(8000);
    expect(result.truncated).toBe(true);
    expect(result.combinations).toEqual([]);
  });

  it('allows exactly maxRows', () => {
    const axes = [{ key: 'size', valueKeys: Array.from({ length: 250 }, (_, i) => `s${i}`) }];
    const result = generateVariantCombinations(axes, 250);
    expect(result.truncated).toBe(false);
    expect(result.combinations).toHaveLength(250);
  });
});

describe('newCombinationsOnly', () => {
  it('adding a value to an axis yields only the new combinations', () => {
    const before = generateVariantCombinations([
      { key: 'size', valueKeys: ['S', 'M'] },
      { key: 'color', valueKeys: ['RED'] },
    ]).combinations;

    const after = generateVariantCombinations([
      { key: 'size', valueKeys: ['S', 'M'] },
      { key: 'color', valueKeys: ['RED', 'BLU'] },
    ]).combinations;

    expect(newCombinationsOnly(after, before)).toEqual([
      { valueKeys: ['S', 'BLU'] },
      { valueKeys: ['M', 'BLU'] },
    ]);
  });

  it('yields nothing when nothing changed', () => {
    const combos = generateVariantCombinations([{ key: 'size', valueKeys: ['S', 'M'] }]).combinations;
    expect(newCombinationsOnly(combos, combos)).toEqual([]);
  });
});

describe('removedCombinations', () => {
  it('flags a combination whose value was removed from the axis, without deleting anything itself', () => {
    const existing = generateVariantCombinations([{ key: 'size', valueKeys: ['S', 'M', 'L'] }]).combinations;
    const current = generateVariantCombinations([{ key: 'size', valueKeys: ['S', 'M'] }]).combinations;

    expect(removedCombinations(current, existing)).toEqual([{ valueKeys: ['L'] }]);
  });
});
