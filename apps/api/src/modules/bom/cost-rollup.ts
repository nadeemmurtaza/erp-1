/**
 * The BOM cost rollup (WO-C.2, 10-admin-dashboard.md §C) — a pure function,
 * deliberately: it takes plain numbers in, returns plain numbers out, holds
 * no `prisma.` read and no `publish(`, and has a second read-only caller
 * (the `:id/cost` breakdown endpoint) alongside recipe.service.ts's own
 * recompute path. That is what makes it dry-runnable and independently
 * testable without a database.
 *
 * `rolledUpUnitCost`/`costComplete` are a CACHE for the recipe editor's
 * estimate. They are never the COGS of an actual sale — that stays
 * OrderItem.unitCost (Rule 7) — and recomputing this twice on identical
 * inputs must return the identical output (idempotent, for at-least-once
 * event delivery).
 */

export interface RecipeCostComponentInput {
  rawMaterialId: string;
  /** BASE units of the raw material consumed per recipe.outputQuantity finished units. */
  quantityBase: number;
  /** Overrides the recipe's own wastageBps for this line. Null = inherit. */
  wastageBps: number | null;
  isOptional: boolean;
  /** ProductVariant.costPrice of the raw material's own variant, paisa. 0 means UNKNOWN, not free. */
  rawMaterialCostPrice: number;
}

export interface RecipeCostInput {
  /** Recipe-level default, basis points. 500 = 5%. */
  wastageBps: number;
  outputQuantity: number;
  labourCost: number;
  overheadCost: number;
  components: RecipeCostComponentInput[];
}

export interface RecipeCostComponentResult extends RecipeCostComponentInput {
  effectiveBps: number;
  /** ceil(quantityBase * (10000 + effectiveBps) / 10000) — you cannot consume 0.4 of a button. */
  componentBaseQty: number;
  /** componentBaseQty * rawMaterialCostPrice, integer paisa. */
  componentCost: number;
}

export interface RecipeCostResult {
  components: RecipeCostComponentResult[];
  /** Sum of componentCost over non-optional components only. */
  materialCost: number;
  /** round(materialCost / outputQuantity) + labourCost + overheadCost. */
  rolledUpUnitCost: number;
  /** False when any non-optional component's rawMaterialCostPrice is 0 (never received). */
  costComplete: boolean;
}

export function computeRecipeCost(input: RecipeCostInput): RecipeCostResult {
  const components = input.components.map((component) => {
    const effectiveBps = component.wastageBps ?? input.wastageBps;
    const componentBaseQty = Math.ceil((component.quantityBase * (10000 + effectiveBps)) / 10000);
    const componentCost = componentBaseQty * component.rawMaterialCostPrice;
    return { ...component, effectiveBps, componentBaseQty, componentCost };
  });

  const nonOptional = components.filter((component) => !component.isOptional);
  const materialCost = nonOptional.reduce((sum, component) => sum + component.componentCost, 0);
  const outputQuantity = input.outputQuantity > 0 ? input.outputQuantity : 1;
  const rolledUpUnitCost = Math.round(materialCost / outputQuantity) + input.labourCost + input.overheadCost;
  const costComplete = nonOptional.every((component) => component.rawMaterialCostPrice > 0);

  return { components, materialCost, rolledUpUnitCost, costComplete };
}
