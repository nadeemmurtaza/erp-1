/**
 * The discount rules engine. Pure, deterministic, exhaustively unit tested
 * (House Rule 11 — this exact file is imported by the API at checkout and by
 * the storefront to preview a discount before the order is placed; if the
 * two ever disagree, a customer sees one price and is charged another).
 *
 * See docs/implementation/05-promotions-giftcards.md WO-5.1 for the model
 * this evaluates and the stacking rules below.
 */

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING' | 'BUY_X_GET_Y' | 'TIERED';
export type DiscountScope = 'ORDER' | 'PRODUCT' | 'CATEGORY' | 'COLLECTION' | 'SHIPPING';

/**
 * A `Discount` row's shape, as `evaluateDiscounts` needs it — no id-only
 * fields (createdAt, usageCount, ...) it never reads. Usage-limit checks are
 * the caller's job (they need a database read this pure function must not
 * do); `evaluateDiscounts` only ever answers "if this discount is allowed to
 * run, what would it do to this cart".
 */
export interface DiscountRule {
  id: string;
  name: string;
  type: DiscountType;
  scope: DiscountScope;
  /** PERCENTAGE/TIERED: basis points (1000 = 10%). FIXED_AMOUNT: paisa. Unused by FREE_SHIPPING/BUY_X_GET_Y. */
  value: number;
  /**
   * Cap on a PERCENTAGE/TIERED discount, in paisa, across every unit this
   * discount matches. Applied as an even per-unit ceiling
   * (`floor(maxDiscount / matchingQuantity)`) rather than a lump-sum split
   * across lines — the lump-sum split can only be expressed by rounding
   * `OrderItem.discountUnit` unevenly across a line's own quantity, which
   * would make two units of the same line disagree on their own receipt
   * price for no reason a customer could explain. The even-per-unit cap is
   * simpler, never exceeds the intended cap, and never drifts a paisa
   * between this function and `computeOrderTotals`'s own recombination.
   */
  maxDiscount: number | null;
  minSubtotal: number | null;
  minQuantity: number | null;
  /** PRODUCT scope match set. Also COLLECTION scope: the caller resolves a collection's member product ids into this array before calling in — there is no separate collection concept here. */
  productIds: string[];
  /** CATEGORY scope match set — matched against each line's own `categoryIds`. */
  categoryIds: string[];
  firstOrderOnly: boolean;
  /** BUY_X_GET_Y only. */
  buyQuantity: number | null;
  getQuantity: number | null;
  /** BUY_X_GET_Y only. 10000 = the qualifying unit is free. */
  getDiscountBps: number | null;
  isStackable: boolean;
  /** Lower runs first among stackable discounts. */
  priority: number;
}

export interface CartLineSnapshot {
  /** Stable within one evaluation — the caller's own line/OrderItem id. */
  id: string;
  productId: string | null;
  /** Every category the line's product belongs to, already resolved by the caller. */
  categoryIds: string[];
  /** Paisa, before any discount. */
  unitPrice: number;
  quantity: number;
}

export interface CartSnapshot {
  lines: CartLineSnapshot[];
  /** Paisa, before any FREE_SHIPPING discount. */
  shippingFee: number;
}

export interface DiscountContext {
  isFirstOrder: boolean;
}

/** One line actually recorded in `docs/implementation/05-promotions-giftcards.md`'s `OrderDiscount` snapshot. */
export interface AppliedDiscount {
  discountId: string;
  name: string;
  type: DiscountType;
  /** Total this discount removed, paisa — across every line it touched, plus shipping when it discounted that. */
  amount: number;
}

export interface DiscountResult {
  /** Paisa off ONE unit of the named line — feeds `LineItemInput.discountPerUnit`. */
  linePerUnitDiscounts: Record<string, number>;
  /** Paisa off the order as a whole — feeds `OrderTotalsInput.orderDiscount`. */
  orderDiscount: number;
  /** Paisa off the shipping fee (FREE_SHIPPING) — the caller subtracts this from its own shipping-fee input before calling `computeOrderTotals`. */
  shippingDiscount: number;
  applied: AppliedDiscount[];
}

function lineSubtotal(line: CartLineSnapshot): number {
  return line.unitPrice * line.quantity;
}

function matchesScope(rule: DiscountRule, line: CartLineSnapshot): boolean {
  switch (rule.scope) {
    case 'PRODUCT':
    case 'COLLECTION':
      return rule.productIds.length === 0 || (line.productId !== null && rule.productIds.includes(line.productId));
    case 'CATEGORY':
      return rule.categoryIds.length === 0 || line.categoryIds.some((id) => rule.categoryIds.includes(id));
    case 'ORDER':
    case 'SHIPPING':
      return true;
  }
}

function eligibleLines(rule: DiscountRule, cart: CartSnapshot): CartLineSnapshot[] {
  return rule.scope === 'ORDER' || rule.scope === 'SHIPPING'
    ? cart.lines
    : cart.lines.filter((line) => matchesScope(rule, line));
}

/** Whether the cart, as a whole, satisfies this discount's conditions. Does not check usage limits — the database-backed caller's job. */
export function isDiscountEligible(rule: DiscountRule, cart: CartSnapshot, context: DiscountContext): boolean {
  if (rule.firstOrderOnly && !context.isFirstOrder) return false;

  const matching = eligibleLines(rule, cart);
  if (matching.length === 0) return false;

  const matchingSubtotal = matching.reduce((sum, line) => sum + lineSubtotal(line), 0);
  const matchingQuantity = matching.reduce((sum, line) => sum + line.quantity, 0);

  if (rule.minSubtotal !== null && matchingSubtotal < rule.minSubtotal) return false;
  if (rule.minQuantity !== null && matchingQuantity < rule.minQuantity) return false;
  if (rule.type === 'BUY_X_GET_Y') {
    const groupSize = (rule.buyQuantity ?? 0) + (rule.getQuantity ?? 0);
    if (groupSize <= 0 || matchingQuantity < groupSize) return false;
  }

  return true;
}

interface SingleDiscountEffect {
  linePerUnitDiscounts: Map<string, number>;
  orderDiscount: number;
  shippingDiscount: number;
  amount: number;
}

/**
 * What ONE discount does to the cart, assuming it is eligible and allowed to
 * run — the running-subtotal-aware stacking loop below is what decides
 * whether it actually gets applied. Never clamps against another discount's
 * effect; the caller composes.
 */
function computeSingleEffect(rule: DiscountRule, cart: CartSnapshot): SingleDiscountEffect {
  const linePerUnitDiscounts = new Map<string, number>();
  let orderDiscount = 0;
  let shippingDiscount = 0;

  if (rule.type === 'FREE_SHIPPING') {
    shippingDiscount = cart.shippingFee;
    return { linePerUnitDiscounts, orderDiscount, shippingDiscount, amount: shippingDiscount };
  }

  const matching = eligibleLines(rule, cart);
  const matchingQuantity = matching.reduce((sum, line) => sum + line.quantity, 0);

  if (rule.type === 'BUY_X_GET_Y') {
    const buyQty = rule.buyQuantity ?? 0;
    const getQty = rule.getQuantity ?? 0;
    const groupSize = buyQty + getQty;
    const discountedUnitsTotal = groupSize > 0 ? Math.floor(matchingQuantity / groupSize) * getQty : 0;
    const bps = rule.getDiscountBps ?? 0;

    // Cheapest units first (retailer-favorable, the standard "buy X get Y"
    // convention) — sort a copy, never mutate the caller's cart.
    const byPriceAsc = [...matching].sort((a, b) => a.unitPrice - b.unitPrice);
    let remaining = discountedUnitsTotal;
    let total = 0;
    for (const line of byPriceAsc) {
      if (remaining <= 0) break;
      const unitsHere = Math.min(remaining, line.quantity);
      const lineDiscountTotal = Math.round((unitsHere * line.unitPrice * bps) / 10_000);
      // Spread evenly across the line's own quantity (a line is one
      // OrderItem row with one discountUnit — it cannot itself say "2 of
      // these 3 units were free"). Any remainder from the division goes to
      // orderDiscount so the total this discount removed is still exact.
      const perUnit = Math.floor(lineDiscountTotal / line.quantity);
      const remainder = lineDiscountTotal - perUnit * line.quantity;
      linePerUnitDiscounts.set(line.id, perUnit);
      orderDiscount += remainder;
      total += lineDiscountTotal;
      remaining -= unitsHere;
    }
    return { linePerUnitDiscounts, orderDiscount, shippingDiscount, amount: total };
  }

  // PERCENTAGE, FIXED_AMOUNT, TIERED (evaluated identically to PERCENTAGE —
  // see DiscountType's own doc comment: a tier is several TIERED discounts
  // with different minSubtotal, and the non-stackable best-for-customer rule
  // below is what actually makes tiering emerge).
  const bps = rule.type === 'FIXED_AMOUNT' ? null : rule.value;

  if (rule.scope === 'ORDER') {
    const subtotal = matching.reduce((sum, line) => sum + lineSubtotal(line), 0);
    const raw = bps !== null ? Math.round((subtotal * bps) / 10_000) : rule.value;
    const capped = rule.maxDiscount !== null ? Math.min(raw, rule.maxDiscount) : raw;
    orderDiscount = Math.min(Math.max(0, capped), subtotal);
    return { linePerUnitDiscounts, orderDiscount, shippingDiscount, amount: orderDiscount };
  }

  // PRODUCT / CATEGORY / COLLECTION: a per-unit figure, so it can populate
  // OrderItem.discountUnit without splitting a lump sum across quantity.
  const maxPerUnit =
    rule.maxDiscount !== null && matchingQuantity > 0 ? Math.floor(rule.maxDiscount / matchingQuantity) : null;

  let total = 0;
  for (const line of matching) {
    const raw = bps !== null ? Math.round((line.unitPrice * bps) / 10_000) : rule.value;
    let perUnit = Math.max(0, Math.min(raw, line.unitPrice));
    if (maxPerUnit !== null) perUnit = Math.min(perUnit, maxPerUnit);
    if (perUnit > 0) {
      linePerUnitDiscounts.set(line.id, perUnit);
      total += perUnit * line.quantity;
    }
  }
  return { linePerUnitDiscounts, orderDiscount, shippingDiscount, amount: total };
}

/**
 * Evaluates every ELIGIBLE discount against a cart and returns the combined
 * result, per the stacking rules in `05-promotions-giftcards.md` WO-5.1:
 *
 * - Non-stackable discounts: the single BEST FOR THE CUSTOMER wins.
 * - Stackable ones apply in `priority` order, each on the running subtotal.
 * - A percentage discount never takes a line below zero.
 * - Free shipping never produces a negative shipping fee.
 * - The final order total is never negative.
 *
 * `discounts` must already be filtered to ACTIVE, within their date window —
 * this function has no clock and no database, on purpose (House Rule 11).
 */
export function evaluateDiscounts(
  cart: CartSnapshot,
  discounts: DiscountRule[],
  context: DiscountContext,
): DiscountResult {
  const eligible = discounts.filter((rule) => isDiscountEligible(rule, cart, context));

  const stackable = eligible.filter((rule) => rule.isStackable).sort((a, b) => a.priority - b.priority);
  const nonStackable = eligible.filter((rule) => !rule.isStackable);

  const applied: AppliedDiscount[] = [];
  const linePerUnitDiscounts = new Map<string, number>();
  let orderDiscount = 0;
  let shippingDiscount = 0;

  const addEffect = (rule: DiscountRule, effect: SingleDiscountEffect) => {
    for (const [lineId, perUnit] of effect.linePerUnitDiscounts) {
      linePerUnitDiscounts.set(lineId, (linePerUnitDiscounts.get(lineId) ?? 0) + perUnit);
    }
    orderDiscount += effect.orderDiscount;
    shippingDiscount = Math.min(cart.shippingFee, shippingDiscount + effect.shippingDiscount);
    if (effect.amount > 0) applied.push({ discountId: rule.id, name: rule.name, type: rule.type, amount: effect.amount });
  };

  // Stackable discounts each run against the running subtotal — modeled by
  // shrinking each line's own price by what has already been removed from
  // it, so a second percentage discount is computed off what remains, not
  // off the original price.
  const runningLines: CartLineSnapshot[] = cart.lines.map((line) => ({ ...line }));
  for (const rule of stackable) {
    const runningCart: CartSnapshot = {
      lines: runningLines.map((line) => ({
        ...line,
        unitPrice: Math.max(0, line.unitPrice - (linePerUnitDiscounts.get(line.id) ?? 0)),
      })),
      shippingFee: Math.max(0, cart.shippingFee - shippingDiscount),
    };
    // Re-check eligibility against the running cart too (a minSubtotal
    // condition must hold against what's actually left to discount).
    if (!isDiscountEligible(rule, runningCart, context)) continue;
    addEffect(rule, computeSingleEffect(rule, runningCart));
  }

  // Non-stackable: the single best for the customer. Compare by evaluating
  // each independently against the cart as stacking left it, then take the
  // one removing the most money.
  if (nonStackable.length > 0) {
    const baseCart: CartSnapshot = {
      lines: runningLines.map((line) => ({
        ...line,
        unitPrice: Math.max(0, line.unitPrice - (linePerUnitDiscounts.get(line.id) ?? 0)),
      })),
      shippingFee: Math.max(0, cart.shippingFee - shippingDiscount),
    };
    let best: { rule: DiscountRule; effect: SingleDiscountEffect } | null = null;
    for (const rule of nonStackable) {
      if (!isDiscountEligible(rule, baseCart, context)) continue;
      const effect = computeSingleEffect(rule, baseCart);
      if (!best || effect.amount > best.effect.amount) best = { rule, effect };
    }
    if (best) addEffect(best.rule, best.effect);
  }

  // Final safety clamp: several stackable ORDER-scope discounts each cap
  // themselves against the full subtotal independently (an ORDER-scope
  // discount has no single line to shrink the way a PRODUCT-scope one does),
  // so their SUM can still exceed what's left after line-level discounts.
  // The order total must never go negative regardless of how many combined.
  const totalAfterLineDiscounts = cart.lines.reduce(
    (sum, line) => sum + Math.max(0, line.unitPrice - (linePerUnitDiscounts.get(line.id) ?? 0)) * line.quantity,
    0,
  );
  orderDiscount = Math.min(orderDiscount, totalAfterLineDiscounts);

  return {
    linePerUnitDiscounts: Object.fromEntries(linePerUnitDiscounts),
    orderDiscount,
    shippingDiscount,
    applied,
  };
}
