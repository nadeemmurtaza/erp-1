/**
 * Order maths. All amounts are integer paisa.
 *
 * The API is authoritative — it recomputes every total from the database before
 * writing an order — but the storefront needs the identical numbers to show a
 * live price as the customer picks stitching options, so the arithmetic lives
 * here and is used by both. `pricing.spec.ts` is the guard.
 */

export interface StitchingPriceInput {
  /**
   * What the make-up costs before options, in paisa: the garment type's own
   * stitching price, or a chosen STITCHING_SERVICE product's when the customer
   * upgraded to one. Which of the two applies is the caller's decision.
   */
  baseFee: number;
  /** Price deltas of the chosen style options, in paisa. May be negative. */
  optionDeltas: number[];
}

export function computeStitchingFee(input: StitchingPriceInput): number {
  const total = input.optionDeltas.reduce((sum, delta) => sum + delta, input.baseFee);
  // A discount-heavy option set must never make stitching cost negative.
  return Math.max(0, Math.round(total));
}

/**
 * Same computation, from a cart/order line's own shape: a stitched line's base
 * fee is the garment type's standard price, unless the customer upgraded to a
 * specific STITCHING_SERVICE product, whose price replaces it rather than
 * adding to it.
 */
export function stitchingFeeFor(
  item: {
    garmentType: { stitchingPrice: number } | null;
    stitchingService: { basePrice: number } | null;
  },
  optionDeltas: number[],
): number {
  if (!item.garmentType) return 0;

  return computeStitchingFee({
    baseFee: item.stitchingService?.basePrice ?? item.garmentType.stitchingPrice,
    optionDeltas,
  });
}

export interface LineItemInput {
  /** Unit price of the product variant, in paisa. */
  unitPrice: number;
  quantity: number;
  /** Stitching fee for ONE unit, in paisa. Zero when no stitching was added. */
  stitchingFeePerUnit?: number;
  /** Per-unit discount, in paisa. */
  discountPerUnit?: number;
}

export interface LineItemTotals {
  /** Product price only, before stitching: unitPrice * quantity. */
  productTotal: number;
  /** Stitching fee across all units. */
  stitchingTotal: number;
  discountTotal: number;
  /** productTotal + stitchingTotal - discountTotal. */
  lineTotal: number;
}

export function computeLineItem(input: LineItemInput): LineItemTotals {
  const quantity = Math.max(0, Math.trunc(input.quantity));
  const productTotal = input.unitPrice * quantity;
  const stitchingTotal = (input.stitchingFeePerUnit ?? 0) * quantity;
  const discountTotal = Math.min(
    (input.discountPerUnit ?? 0) * quantity,
    productTotal + stitchingTotal,
  );

  return {
    productTotal,
    stitchingTotal,
    discountTotal,
    lineTotal: productTotal + stitchingTotal - discountTotal,
  };
}

export function lineMargin(lineTotal: number, unitCost: number, quantity: number): number {
  return lineTotal - (unitCost * quantity);
}

export interface TaxResult {
  /** Tax on this line, in paisa. */
  taxAmount: number;
  /** What the line costs the customer, including tax. */
  total: number;
}

/**
 * EXCLUSIVE mode: `lineAmount` is the pre-tax price; tax is added on top.
 * `total` is what the customer ends up paying for this line.
 */
export function taxExclusive(lineAmount: number, rateBps: number): TaxResult {
  const taxAmount = Math.round((lineAmount * rateBps) / 10_000);
  return { taxAmount, total: lineAmount + taxAmount };
}

/**
 * INCLUSIVE mode: `lineAmount` already contains the tax — extracted here for
 * the invoice/report only. `total` is unchanged from `lineAmount`; inclusive
 * mode never changes what a customer pays, only how it is broken down.
 */
export function taxInclusive(lineAmount: number, rateBps: number): TaxResult {
  const taxAmount = lineAmount - Math.round((lineAmount * 10_000) / (10_000 + rateBps));
  return { taxAmount, total: lineAmount };
}

/**
 * The rounding trap (same shape as `allocateLandedCost`'s): summing each
 * line's independently-rounded `taxAmount` and re-deriving an order-level
 * tax figure from the pre-tax grand total will disagree by a paisa or two on
 * some carts, because integer rounding does not distribute across a sum.
 * There is exactly one correct source of truth — call `taxExclusive`/
 * `taxInclusive` per line, in `orders.service.ts`, and SUM those results.
 * Never compute tax a second way at the order level; `computeOrderTotals()`
 * below only ever adds a `taxAmount` its caller already summed line by line.
 */
export interface OrderTotalsInput {
  items: LineItemInput[];
  /** Shipping charge for the delivery zone, in paisa. */
  shippingFee?: number;
  /** Extra charge for collecting cash on delivery, in paisa. */
  codFee?: number;
  /** Order-level discount (coupon), in paisa. */
  orderDiscount?: number;
  /**
   * EXCLUSIVE-mode tax only, pre-summed by the caller from each line's
   * `taxExclusive()` result — added on top of the goods total. Omit (or 0)
   * when tax is disabled or the shop uses INCLUSIVE mode, where tax is
   * already inside `items[].unitPrice` and changes nothing here.
   */
  taxAmount?: number;
}

export interface OrderTotals {
  itemsSubtotal: number;
  stitchingSubtotal: number;
  itemDiscountTotal: number;
  orderDiscount: number;
  shippingFee: number;
  codFee: number;
  /** EXCLUSIVE-mode tax added on top; 0 when tax is off or mode is INCLUSIVE. */
  taxAmount: number;
  /** What the customer pays. Never negative. */
  grandTotal: number;
}

export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const lines = input.items.map(computeLineItem);

  const itemsSubtotal = lines.reduce((sum, line) => sum + line.productTotal, 0);
  const stitchingSubtotal = lines.reduce((sum, line) => sum + line.stitchingTotal, 0);
  const itemDiscountTotal = lines.reduce((sum, line) => sum + line.discountTotal, 0);

  const shippingFee = Math.max(0, input.shippingFee ?? 0);
  const codFee = Math.max(0, input.codFee ?? 0);
  // Pre-summed by the caller from taxExclusive() per line — see the note on
  // OrderTotalsInput.taxAmount. Never recomputed here from a rate.
  const taxAmount = Math.max(0, input.taxAmount ?? 0);

  const afterItemDiscounts = itemsSubtotal + stitchingSubtotal - itemDiscountTotal;
  // An oversized coupon reduces the goods to zero but never eats the shipping
  // fee or turns into a refund.
  const orderDiscount = Math.min(Math.max(0, input.orderDiscount ?? 0), afterItemDiscounts);

  return {
    itemsSubtotal,
    stitchingSubtotal,
    itemDiscountTotal,
    orderDiscount,
    shippingFee,
    codFee,
    taxAmount,
    grandTotal: afterItemDiscounts - orderDiscount + shippingFee + codFee + taxAmount,
  };
}

export interface ShippingZoneRate {
  /** Flat charge for the zone, in paisa. */
  fee: number;
  /** Order goods subtotal at or above which shipping is free. 0 disables it. */
  freeAbove?: number;
}

export function computeShippingFee(goodsSubtotal: number, zone: ShippingZoneRate): number {
  if (zone.freeAbove && zone.freeAbove > 0 && goodsSubtotal >= zone.freeAbove) {
    return 0;
  }
  return Math.max(0, zone.fee);
}


export interface ReceiptLineInput {
  quantity: number;
  unitCost: number;
}

export function allocateLandedCost(lines: ReceiptLineInput[], extra: number): number[] {
  if (lines.length === 0) return [];
  if (extra === 0) return lines.map(() => 0);

  const lineValues = lines.map(l => l.quantity * l.unitCost);
  const totalValue = lineValues.reduce((sum, v) => sum + v, 0);

  const shares = new Array(lines.length).fill(0);

  if (totalValue === 0) {
    // all free samples, allocate entirely to line with largest quantity
    let maxQty = -1;
    let maxIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].quantity > maxQty) {
        maxQty = lines[i].quantity;
        maxIdx = i;
      }
    }
    shares[maxIdx] = extra;
    return shares;
  }

  let sumShares = 0;
  let maxLineValue = -1;
  let maxIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const share = Math.round(extra * lineValues[i] / totalValue);
    shares[i] = share;
    sumShares += share;
    if (lineValues[i] > maxLineValue) {
      maxLineValue = lineValues[i];
      maxIdx = i;
    }
  }

  // fix rounding drift
  const drift = extra - sumShares;
  if (drift !== 0) {
    shares[maxIdx] += drift;
  }

  return shares;
}

/**
 * Converts a minor-unit amount in a foreign currency to the deployment's own
 * base currency, given a scaled FX rate (RETAIL-ERP.md R16 / House Rule 11).
 *
 * `fxRateScaled` is the rate times 1,000,000, stored as an integer so the
 * rate itself never becomes a float (House Rule 5) — 1_000_000 means "no
 * conversion". Written once here so the API, web and till round every
 * conversion identically; nowhere else may re-derive this formula.
 */
export function convertToBase(amountMinor: number, fxRateScaled: number): number {
  return Math.round((amountMinor * fxRateScaled) / 1_000_000);
}

export function weightedAverageCost(stockBefore: number, currentCostPrice: number, receivedQty: number, landedUnitCost: number): number {
  const clampedStockBefore = Math.max(0, stockBefore);
  if (clampedStockBefore === 0 || currentCostPrice === 0) {
    return landedUnitCost;
  }

  const oldValue = clampedStockBefore * currentCostPrice;
  const newValue = receivedQty * landedUnitCost;
  return Math.round((oldValue + newValue) / (clampedStockBefore + receivedQty));
}

