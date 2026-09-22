import { computeRecipeCost } from './cost-rollup';

describe('computeRecipeCost', () => {
  it('rolls up a 2-gaz + 6-button + 1-spool recipe to the exact expected integer', () => {
    // 2000 base units of fabric at 50 paisa/base-unit = 100000
    // 6 buttons at 200 paisa each = 1200
    // 1 spool of thread at 5000 paisa = 5000
    // materialCost = 106200; outputQuantity 1 -> rolledUpUnitCost = 106200 + labour + overhead
    const result = computeRecipeCost({
      wastageBps: 0,
      outputQuantity: 1,
      labourCost: 3000,
      overheadCost: 1000,
      components: [
        { rawMaterialId: 'fabric', quantityBase: 2000, wastageBps: null, isOptional: false, rawMaterialCostPrice: 50 },
        { rawMaterialId: 'button', quantityBase: 6, wastageBps: null, isOptional: false, rawMaterialCostPrice: 200 },
        { rawMaterialId: 'thread', quantityBase: 1, wastageBps: null, isOptional: false, rawMaterialCostPrice: 5000 },
      ],
    });

    expect(result.materialCost).toBe(106200);
    expect(result.rolledUpUnitCost).toBe(106200 + 3000 + 1000);
    expect(result.costComplete).toBe(true);
  });

  it('ceils a wastage line rather than rounding down or discarding the fraction', () => {
    // 1000 base units at 5% wastage -> 1000 * 10500 / 10000 = 1050 exactly (no fraction here)
    // use a quantity that produces a genuine fraction: 999 base units at 5%
    // -> 999 * 10500 / 10000 = 1048.95 -> ceil = 1049
    const result = computeRecipeCost({
      wastageBps: 500,
      outputQuantity: 1,
      labourCost: 0,
      overheadCost: 0,
      components: [
        { rawMaterialId: 'fabric', quantityBase: 999, wastageBps: null, isOptional: false, rawMaterialCostPrice: 10 },
      ],
    });

    expect(result.components[0].componentBaseQty).toBe(1049);
    expect(result.materialCost).toBe(10490);
  });

  it('a component-level wastageBps overrides the recipe default', () => {
    const result = computeRecipeCost({
      wastageBps: 500,
      outputQuantity: 1,
      labourCost: 0,
      overheadCost: 0,
      components: [
        { rawMaterialId: 'fabric', quantityBase: 1000, wastageBps: 1000, isOptional: false, rawMaterialCostPrice: 1 },
      ],
    });

    // 1000 base units at 10% (component override, not the 5% recipe default) -> 1100
    expect(result.components[0].effectiveBps).toBe(1000);
    expect(result.components[0].componentBaseQty).toBe(1100);
  });

  it('a zero-cost non-optional component sets costComplete to false, and is not treated as free', () => {
    const result = computeRecipeCost({
      wastageBps: 0,
      outputQuantity: 1,
      labourCost: 500,
      overheadCost: 0,
      components: [
        { rawMaterialId: 'fabric', quantityBase: 100, wastageBps: null, isOptional: false, rawMaterialCostPrice: 0 },
      ],
    });

    expect(result.costComplete).toBe(false);
    // Cost is still summed (0), not skipped — the flag carries the warning, not a hidden number.
    expect(result.materialCost).toBe(0);
    expect(result.rolledUpUnitCost).toBe(500);
  });

  it('an optional component with zero cost does not affect costComplete', () => {
    const result = computeRecipeCost({
      wastageBps: 0,
      outputQuantity: 1,
      labourCost: 0,
      overheadCost: 0,
      components: [
        { rawMaterialId: 'fabric', quantityBase: 100, wastageBps: null, isOptional: false, rawMaterialCostPrice: 10 },
        { rawMaterialId: 'trim', quantityBase: 5, wastageBps: null, isOptional: true, rawMaterialCostPrice: 0 },
      ],
    });

    expect(result.costComplete).toBe(true);
    // Optional components never enter materialCost.
    expect(result.materialCost).toBe(1000);
  });

  it('outputQuantity 12 divides material cost by 12 before adding per-unit labour', () => {
    const result = computeRecipeCost({
      wastageBps: 0,
      outputQuantity: 12,
      labourCost: 50,
      overheadCost: 0,
      components: [
        { rawMaterialId: 'fabric', quantityBase: 12000, wastageBps: null, isOptional: false, rawMaterialCostPrice: 10 },
      ],
    });

    // materialCost = 120000; / 12 = 10000; + labour 50 = 10050
    expect(result.materialCost).toBe(120000);
    expect(result.rolledUpUnitCost).toBe(10050);
  });

  it('is idempotent — identical inputs produce an identical result on repeat calls', () => {
    const input = {
      wastageBps: 250,
      outputQuantity: 3,
      labourCost: 120,
      overheadCost: 40,
      components: [
        { rawMaterialId: 'fabric', quantityBase: 777, wastageBps: null, isOptional: false, rawMaterialCostPrice: 37 },
      ],
    };

    expect(computeRecipeCost(input)).toEqual(computeRecipeCost(input));
  });
});
