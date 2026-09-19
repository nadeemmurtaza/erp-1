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
export interface BasketLine {
  variantId: string;
  sku: string;
  nameEn: string;
  /** Unit price in paisa, snapshotted when the line was added — a live price
   * change mid-sale must not silently reprice a basket already on screen. */
  unitPrice: number;
  quantity: number;
}

export type Basket = readonly BasketLine[];

/** Adds a line, or increments an existing one for the same variant. */
export function addLine(basket: Basket, line: Omit<BasketLine, 'quantity'>, quantity = 1): Basket {
  if (quantity <= 0) return basket;

  const existing = basket.find((l) => l.variantId === line.variantId);
  if (!existing) {
    return [...basket, { ...line, quantity }];
  }

  return basket.map((l) => (l.variantId === line.variantId ? { ...l, quantity: l.quantity + quantity } : l));
}

/** Sets a line's quantity outright; a quantity of 0 or less removes it. */
export function setQuantity(basket: Basket, variantId: string, quantity: number): Basket {
  if (quantity <= 0) return removeLine(basket, variantId);
  return basket.map((l) => (l.variantId === variantId ? { ...l, quantity } : l));
}

export function removeLine(basket: Basket, variantId: string): Basket {
  return basket.filter((l) => l.variantId !== variantId);
}

export function clearBasket(): Basket {
  return [];
}

/**
 * The basket's totals — zero shipping/COD/tax, the same simplification
 * `OrdersService.placeFromPos()` makes server-side (no shipping at a till,
 * no COD fee for a cash sale, tax integration for POS unscoped). The server
 * recomputes this from the same line list when the sale is submitted; this
 * is only ever a live preview on screen.
 */
export function basketTotals(basket: Basket): OrderTotals {
  return computeOrderTotals({
    items: basket.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
  });
}

export function lineTotal(line: BasketLine): number {
  return computeLineItem({ unitPrice: line.unitPrice, quantity: line.quantity }).lineTotal;
}
