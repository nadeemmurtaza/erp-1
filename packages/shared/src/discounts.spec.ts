import { evaluateDiscounts, isDiscountEligible, type CartSnapshot, type DiscountRule } from './discounts';
import { toMinor } from './constants';

function rule(overrides: Partial<DiscountRule>): DiscountRule {
  return {
    id: 'd1',
    name: 'Test discount',
    type: 'PERCENTAGE',
    scope: 'ORDER',
    value: 0,
    maxDiscount: null,
    minSubtotal: null,
    minQuantity: null,
    productIds: [],
    categoryIds: [],
    firstOrderOnly: false,
    buyQuantity: null,
    getQuantity: null,
    getDiscountBps: null,
    isStackable: false,
    priority: 0,
    ...overrides,
  };
}

function cart(overrides: Partial<CartSnapshot> = {}): CartSnapshot {
  return {
    lines: [{ id: 'l1', productId: 'p1', categoryIds: ['c1'], unitPrice: toMinor(1000), quantity: 2 }],
    shippingFee: toMinor(200),
    ...overrides,
  };
}

describe('isDiscountEligible', () => {
  it('rejects firstOrderOnly for a returning customer', () => {
    const r = rule({ firstOrderOnly: true });
    expect(isDiscountEligible(r, cart(), { isFirstOrder: false })).toBe(false);
    expect(isDiscountEligible(r, cart(), { isFirstOrder: true })).toBe(true);
  });

  it('rejects when the cart subtotal is below minSubtotal', () => {
    const r = rule({ minSubtotal: toMinor(5000) });
    expect(isDiscountEligible(r, cart(), { isFirstOrder: false })).toBe(false);
  });

  it('rejects a PRODUCT-scope rule when no line matches its productIds', () => {
    const r = rule({ scope: 'PRODUCT', productIds: ['other-product'] });
    expect(isDiscountEligible(r, cart(), { isFirstOrder: false })).toBe(false);
  });
});

describe('evaluateDiscounts — PERCENTAGE, ORDER scope', () => {
  it('discounts the order subtotal by basis points', () => {
    const result = evaluateDiscounts(cart(), [rule({ type: 'PERCENTAGE', value: 1000 })], { isFirstOrder: false });
    // 2 * Rs 1000 = Rs 2000 subtotal, 10% = Rs 200
    expect(result.orderDiscount).toBe(toMinor(200));
    expect(result.applied).toEqual([{ discountId: 'd1', name: 'Test discount', type: 'PERCENTAGE', amount: toMinor(200) }]);
  });

  it('caps at maxDiscount', () => {
    const result = evaluateDiscounts(
      cart(),
      [rule({ type: 'PERCENTAGE', value: 5000, maxDiscount: toMinor(300) })],
      { isFirstOrder: false },
    );
    expect(result.orderDiscount).toBe(toMinor(300));
  });

  it('never takes the order below zero', () => {
    const result = evaluateDiscounts(cart(), [rule({ type: 'FIXED_AMOUNT', value: toMinor(999_999) })], {
      isFirstOrder: false,
    });
    expect(result.orderDiscount).toBe(toMinor(2000));
    expect(result.orderDiscount).toBeGreaterThanOrEqual(0);
  });
});

describe('evaluateDiscounts — PRODUCT scope', () => {
  it('produces a per-unit line discount, not an order discount', () => {
    const result = evaluateDiscounts(
      cart(),
      [rule({ type: 'FIXED_AMOUNT', scope: 'PRODUCT', productIds: ['p1'], value: toMinor(100) })],
      { isFirstOrder: false },
    );
    expect(result.linePerUnitDiscounts).toEqual({ l1: toMinor(100) });
    expect(result.orderDiscount).toBe(0);
  });

  it('never discounts a unit below zero', () => {
    const result = evaluateDiscounts(
      cart(),
      [rule({ type: 'FIXED_AMOUNT', scope: 'PRODUCT', productIds: ['p1'], value: toMinor(999_999) })],
      { isFirstOrder: false },
    );
    expect(result.linePerUnitDiscounts.l1).toBe(toMinor(1000));
  });

  it('does not touch a line outside its productIds', () => {
    const twoLines = cart({
      lines: [
        { id: 'l1', productId: 'p1', categoryIds: [], unitPrice: toMinor(1000), quantity: 1 },
        { id: 'l2', productId: 'p2', categoryIds: [], unitPrice: toMinor(500), quantity: 1 },
      ],
    });
    const result = evaluateDiscounts(
      twoLines,
      [rule({ type: 'FIXED_AMOUNT', scope: 'PRODUCT', productIds: ['p1'], value: toMinor(100) })],
      { isFirstOrder: false },
    );
    expect(result.linePerUnitDiscounts).toEqual({ l1: toMinor(100) });
  });

  it('caps a percentage PRODUCT discount as an even per-unit ceiling', () => {
    const twoLines = cart({
      lines: [
        { id: 'l1', productId: 'p1', categoryIds: [], unitPrice: toMinor(1000), quantity: 2 },
        { id: 'l2', productId: 'p1', categoryIds: [], unitPrice: toMinor(1000), quantity: 2 },
      ],
    });
    // 50% off 4 units of Rs 1000 = Rs 500/unit raw, capped so the total never
    // exceeds Rs 800 across 4 matching units -> Rs 200/unit ceiling.
    const result = evaluateDiscounts(
      twoLines,
      [rule({ type: 'PERCENTAGE', scope: 'PRODUCT', productIds: ['p1'], value: 5000, maxDiscount: toMinor(800) })],
      { isFirstOrder: false },
    );
    expect(result.linePerUnitDiscounts.l1).toBe(toMinor(200));
    expect(result.linePerUnitDiscounts.l2).toBe(toMinor(200));
  });
});

describe('evaluateDiscounts — CATEGORY scope', () => {
  it('matches by a line categoryIds overlap', () => {
    const result = evaluateDiscounts(
      cart(),
      [rule({ type: 'FIXED_AMOUNT', scope: 'CATEGORY', categoryIds: ['c1'], value: toMinor(50) })],
      { isFirstOrder: false },
    );
    expect(result.linePerUnitDiscounts).toEqual({ l1: toMinor(50) });
  });
});

describe('evaluateDiscounts — FREE_SHIPPING', () => {
  it('zeroes the shipping fee', () => {
    const result = evaluateDiscounts(cart(), [rule({ type: 'FREE_SHIPPING', scope: 'SHIPPING' })], {
      isFirstOrder: false,
    });
    expect(result.shippingDiscount).toBe(toMinor(200));
  });
});

describe('evaluateDiscounts — BUY_X_GET_Y', () => {
  it('discounts the cheapest qualifying units', () => {
    const threeLines = cart({
      lines: [
        { id: 'cheap', productId: 'p1', categoryIds: [], unitPrice: toMinor(500), quantity: 1 },
        { id: 'mid', productId: 'p1', categoryIds: [], unitPrice: toMinor(1000), quantity: 1 },
        { id: 'expensive', productId: 'p1', categoryIds: [], unitPrice: toMinor(1500), quantity: 1 },
      ],
      shippingFee: 0,
    });
    // Buy 2 get 1 free, 3 matching units -> exactly one group -> 1 free unit,
    // taken from the cheapest line.
    const result = evaluateDiscounts(
      threeLines,
      [rule({ type: 'BUY_X_GET_Y', scope: 'PRODUCT', productIds: ['p1'], buyQuantity: 2, getQuantity: 1, getDiscountBps: 10_000 })],
      { isFirstOrder: false },
    );
    expect(result.linePerUnitDiscounts.cheap).toBe(toMinor(500));
    expect(result.linePerUnitDiscounts.mid).toBeUndefined();
    expect(result.linePerUnitDiscounts.expensive).toBeUndefined();
  });

  it('is not eligible below one full group', () => {
    const r = rule({ type: 'BUY_X_GET_Y', scope: 'PRODUCT', productIds: ['p1'], buyQuantity: 2, getQuantity: 1, getDiscountBps: 10_000 });
    expect(isDiscountEligible(r, cart({ lines: [{ id: 'l1', productId: 'p1', categoryIds: [], unitPrice: toMinor(500), quantity: 2 }] }), { isFirstOrder: false })).toBe(false);
  });
});

describe('evaluateDiscounts — stacking', () => {
  it('picks the single best non-stackable discount for the customer', () => {
    const worse = rule({ id: 'worse', type: 'FIXED_AMOUNT', value: toMinor(100), isStackable: false });
    const better = rule({ id: 'better', type: 'FIXED_AMOUNT', value: toMinor(300), isStackable: false });
    const result = evaluateDiscounts(cart(), [worse, better], { isFirstOrder: false });
    expect(result.orderDiscount).toBe(toMinor(300));
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]!.discountId).toBe('better');
  });

  it('applies stackable discounts in priority order, each on the running subtotal', () => {
    // Rs 2000 subtotal. First: 10% off (Rs 200) -> Rs 1800 remains.
    // Second: another 10% off the REMAINING Rs 1800 -> Rs 180, not Rs 200.
    const first = rule({ id: 'first', type: 'PERCENTAGE', scope: 'PRODUCT', productIds: ['p1'], value: 1000, isStackable: true, priority: 0 });
    const second = rule({ id: 'second', type: 'PERCENTAGE', scope: 'PRODUCT', productIds: ['p1'], value: 1000, isStackable: true, priority: 1 });
    const result = evaluateDiscounts(cart(), [first, second], { isFirstOrder: false });
    // 10% of Rs1000/unit = Rs100, then 10% of the remaining Rs900/unit = Rs90.
    expect(result.linePerUnitDiscounts.l1).toBe(toMinor(190));
  });

  it('stackable and non-stackable can combine, non-stackable evaluated after stacking', () => {
    const stackable = rule({ id: 'stack', type: 'FIXED_AMOUNT', value: toMinor(100), isStackable: true, priority: 0 });
    const nonStackable = rule({ id: 'best', type: 'FIXED_AMOUNT', value: toMinor(200), isStackable: false });
    const result = evaluateDiscounts(cart(), [stackable, nonStackable], { isFirstOrder: false });
    expect(result.orderDiscount).toBe(toMinor(100) + toMinor(200));
    expect(result.applied).toHaveLength(2);
  });

  it('the final total never goes negative across combined discounts', () => {
    const a = rule({ id: 'a', type: 'FIXED_AMOUNT', value: toMinor(1500), isStackable: true, priority: 0 });
    const b = rule({ id: 'b', type: 'FIXED_AMOUNT', value: toMinor(1500), isStackable: true, priority: 1 });
    const result = evaluateDiscounts(cart(), [a, b], { isFirstOrder: false });
    expect(result.orderDiscount).toBe(toMinor(2000));
  });
});
