import { computeLineItem, computeOrderTotals, type OrderTotals } from '@newax/shared';

/**
 * The till's own basket — pure functions, no I/O (RETAIL-ERP.md's own
 * `packages/pos-core` description, Part 6's "till and website call the same
 * function rather than agreeing by accident"). Basket maths go through
 * `computeLineItem`/`computeOrderTotals` from `@newax/shared`, the same
 * functions `OrdersService.placeFromPos()` calls server-side — this file
 * never re-derives money, it only holds and mutates the line list before it
 * is sent.
 */

/** pos-hardware/31 §2 — a modifier changes the till total, e.g. "extra shot". */
export interface BasketLineModifier {
  key: string;
  label: string;
  priceDeltaMinor: number;
}

/** pos-hardware/31 §2 — where a line's quantity came from, when it is not a
 *  typed integer: a scale reading, or a scaled BOM recipe (paint tinting,
 *  bakery formulas). */
export type BasketQuantitySource =
  | { source: 'TYPED' }
  | { source: 'SCALE_WEIGHT' }
  | { source: 'BOM_RECIPE_SCALE'; recipeId: string };

export interface BasketLine {
  variantId: string;
  sku: string;
  nameEn: string;
  /** Unit price in paisa, snapshotted when the line was added — a live price
   * change mid-sale must not silently reprice a basket already on screen. */
  unitPrice: number;
  quantity: number;
  /** Present only when this line carries modifiers or a non-typed quantity
   *  source — a stable identity distinct from `variantId` so two
   *  same-variant lines with different modifiers never merge. The caller
   *  (the till UI) generates it (e.g. `crypto.randomUUID()`); this module
   *  stays pure and never generates IDs itself. A line with no `lineRef`
   *  behaves exactly as it always has. */
  lineRef?: string;
  modifiers?: BasketLineModifier[];
  quantitySource?: BasketQuantitySource;
}

export type Basket = readonly BasketLine[];

function isPlainLine(line: Pick<BasketLine, 'modifiers' | 'quantitySource' | 'lineRef'>): boolean {
  const hasModifiers = (line.modifiers?.length ?? 0) > 0;
  const hasNonTypedSource = !!line.quantitySource && line.quantitySource.source !== 'TYPED';
  return !hasModifiers && !hasNonTypedSource && !line.lineRef;
}

/**
 * Adds a line, or increments an existing one for the same variant — but
 * only when BOTH the new line and an existing candidate are "plain" (no
 * modifiers, no non-typed quantity source, no `lineRef`). A line carrying a
 * modifier set or a scale/recipe quantity source always appends as its own
 * new line, never merges — two same-variant lines with different modifiers
 * must never collapse into one.
 */
export function addLine(basket: Basket, line: Omit<BasketLine, 'quantity'>, quantity = 1): Basket {
  if (quantity <= 0) return basket;

  if (!isPlainLine(line)) {
    return [...basket, { ...line, quantity }];
  }

  const existing = basket.find((l) => l.variantId === line.variantId && isPlainLine(l));
  if (!existing) {
    return [...basket, { ...line, quantity }];
  }

  return basket.map((l) => (l === existing ? { ...l, quantity: l.quantity + quantity } : l));
}

/**
 * Sets a line's quantity outright; a quantity of 0 or less removes it. With
 * no `lineRef`, matches only a plain line for that variant (today's exact
 * behaviour, unchanged); with a `lineRef`, matches the line carrying that
 * exact ref instead.
 */
export function setQuantity(basket: Basket, variantId: string, quantity: number, lineRef?: string): Basket {
  if (quantity <= 0) return removeLine(basket, variantId, lineRef);
  return basket.map((l) =>
    l.variantId === variantId && (lineRef ? l.lineRef === lineRef : !l.lineRef) ? { ...l, quantity } : l,
  );
}

export function removeLine(basket: Basket, variantId: string, lineRef?: string): Basket {
  return basket.filter((l) => !(l.variantId === variantId && (lineRef ? l.lineRef === lineRef : !l.lineRef)));
}

export function clearBasket(): Basket {
  return [];
}

function unitPriceWithModifiers(line: Pick<BasketLine, 'unitPrice' | 'modifiers'>): number {
  const modifierDelta = (line.modifiers ?? []).reduce((sum, m) => sum + m.priceDeltaMinor, 0);
  return line.unitPrice + modifierDelta;
}

/**
 * The basket's totals — zero shipping/COD/tax, the same simplification
 * `OrdersService.placeFromPos()` makes server-side (no shipping at a till,
 * no COD fee for a cash sale, tax integration for POS unscoped). The server
 * recomputes this from the same line list when the sale is submitted; this
 * is only ever a live preview on screen. A modifier's `priceDeltaMinor`
 * applies per unit, folded into the line's effective unit price before the
 * shared totals maths runs.
 */
export function basketTotals(basket: Basket): OrderTotals {
  return computeOrderTotals({
    items: basket.map((line) => ({ unitPrice: unitPriceWithModifiers(line), quantity: line.quantity })),
  });
}

export function lineTotal(line: BasketLine): number {
  return computeLineItem({ unitPrice: unitPriceWithModifiers(line), quantity: line.quantity }).lineTotal;
}
