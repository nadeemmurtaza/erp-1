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

export interface OrderTotalsInput {
  items: LineItemInput[];
  /** Shipping charge for the delivery zone, in paisa. */
  shippingFee?: number;
  /** Extra charge for collecting cash on delivery, in paisa. */
  codFee?: number;
  /** Order-level discount (coupon), in paisa. */
  orderDiscount?: number;
}

export interface OrderTotals {
  itemsSubtotal: number;
  stitchingSubtotal: number;
  itemDiscountTotal: number;
  orderDiscount: number;
  shippingFee: number;
  codFee: number;
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
    grandTotal: afterItemDiscounts - orderDiscount + shippingFee + codFee,
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
