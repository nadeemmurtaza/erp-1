import { computeFabricEstimate } from './fabric-estimate';

describe('computeFabricEstimate', () => {
  it('runs the shirt formula when length and sleeve length are both given', () => {
    // ((40 + 3) * 2 + (23 + 2)) / 36 = (86 + 25) / 36 = 3.0833...
    const result = computeFabricEstimate({
      garmentBaseGaz: 2.5,
      lengthInches: 40,
      sleeveLengthInches: 23,
    });

    expect(result.estimatedGaz).toBe(3.08);
    expect(result.estimatedMetres).toBe(2.82);
    expect(result.warnings).toEqual([]);
  });

  it('falls back to the garment base benchmark when measurements are incomplete', () => {
    const result = computeFabricEstimate({ garmentBaseGaz: 5, lengthInches: 40 });
    expect(result.estimatedGaz).toBe(5);
    expect(result.warnings).toEqual([]);
  });

  it('warns and returns zero when neither measurements nor a benchmark are available', () => {
    const result = computeFabricEstimate({ garmentBaseGaz: null });
    expect(result.estimatedGaz).toBe(0);
    expect(result.estimatedMetres).toBe(0);
    expect(result.warnings).toHaveLength(1);
  });

  it('subtracts the wide-width discount for a 54-60in roll', () => {
    const result = computeFabricEstimate({ garmentBaseGaz: 5, wideWidth: true });
    expect(result.estimatedGaz).toBe(4.25);
  });

  it('adds the plus-size allowance and warning when chest exceeds 42in', () => {
    const result = computeFabricEstimate({ garmentBaseGaz: 2.5, chestInches: 44 });
    expect(result.estimatedGaz).toBe(3);
    expect(result.warnings).toEqual([
      'Custom panel slicing requires cross-width joining. Provide an additional 0.5 Gaz of fabric.',
    ]);
  });

  it('adds the plus-size allowance when hips exceed 42in, without double-counting chest', () => {
    const result = computeFabricEstimate({ garmentBaseGaz: 2.5, chestInches: 40, hipsInches: 43 });
    expect(result.estimatedGaz).toBe(3);
    expect(result.warnings).toHaveLength(1);
  });

  it('adds the shrinkage buffer for cotton/linen/lawn fabrics, case-insensitively', () => {
    const result = computeFabricEstimate({ garmentBaseGaz: 2.5, fabricType: 'Premium LAWN' });
    expect(result.estimatedGaz).toBe(2.75);
    expect(result.warnings).toHaveLength(1);
  });

  it('does not add the shrinkage buffer for fabrics outside the trigger list', () => {
    const result = computeFabricEstimate({ garmentBaseGaz: 2.5, fabricType: 'chiffon' });
    expect(result.estimatedGaz).toBe(2.5);
    expect(result.warnings).toEqual([]);
  });

  it('stacks wide-width, plus-size and shrinkage adjustments together', () => {
    const result = computeFabricEstimate({
      garmentBaseGaz: 2.5,
      hipsInches: 45,
      fabricType: 'cotton lawn',
      wideWidth: true,
    });
    // 2.5 - 0.75 + 0.5 + 0.25 = 2.5
    expect(result.estimatedGaz).toBe(2.5);
    expect(result.warnings).toHaveLength(2);
  });

  it('clamps the estimate at zero instead of going negative', () => {
    const result = computeFabricEstimate({ garmentBaseGaz: 0.5, wideWidth: true });
    expect(result.estimatedGaz).toBe(0);
    expect(result.estimatedMetres).toBe(0);
  });
});
