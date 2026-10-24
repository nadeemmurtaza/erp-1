import { addLine, basketTotals, clearBasket, lineTotal, removeLine, setQuantity, type Basket } from './basket';

describe('basket', () => {
  const APPLE: Basket[number] = { variantId: 'v1', sku: 'SKU1', nameEn: 'Apple', unitPrice: 100, quantity: 1 };

  it('adds a new line', () => {
    const basket = addLine([], APPLE, 2);
    expect(basket).toEqual([{ ...APPLE, quantity: 2 }]);
  });

  it('increments an existing line for the same variant rather than duplicating it', () => {
    const basket = addLine(addLine([], APPLE, 1), APPLE, 2);
    expect(basket).toHaveLength(1);
    expect(basket[0]!.quantity).toBe(3);
  });

  it('ignores a non-positive quantity on add', () => {
    expect(addLine([], APPLE, 0)).toEqual([]);
    expect(addLine([], APPLE, -1)).toEqual([]);
  });

  it('setQuantity replaces the quantity outright', () => {
    const basket = setQuantity(addLine([], APPLE, 1), 'v1', 5);
    expect(basket[0]!.quantity).toBe(5);
  });

  it('setQuantity to 0 or less removes the line', () => {
    expect(setQuantity(addLine([], APPLE, 1), 'v1', 0)).toEqual([]);
  });

  it('removeLine drops only the matching variant', () => {
    const basket = addLine(addLine([], APPLE, 1), { ...APPLE, variantId: 'v2' }, 1);
    expect(removeLine(basket, 'v1')).toEqual([{ ...APPLE, variantId: 'v2', quantity: 1 }]);
  });

  it('clearBasket empties it', () => {
    expect(clearBasket()).toEqual([]);
  });

  it('lineTotal is unitPrice * quantity for a plain POS line', () => {
    expect(lineTotal({ ...APPLE, quantity: 3, unitPrice: 150 })).toBe(450);
  });

  it('basketTotals sums the basket with zero shipping/COD/tax', () => {
    const basket = addLine(addLine([], APPLE, 2), { ...APPLE, variantId: 'v2', unitPrice: 50 }, 1);
    const totals = basketTotals(basket);

    expect(totals.itemsSubtotal).toBe(250);
    expect(totals.shippingFee).toBe(0);
    expect(totals.codFee).toBe(0);
    expect(totals.taxAmount).toBe(0);
    expect(totals.grandTotal).toBe(250);
  });

  // pos-hardware/31 §2 — modifiers and non-typed quantity sources.
  describe('modifiers and quantity sources (pos-hardware/31)', () => {
    it('two same-variant lines with different modifiers never merge', () => {
      const withModifier = {
        ...APPLE,
        lineRef: 'ref-1',
        modifiers: [{ key: 'extra-shot', label: 'Extra shot', priceDeltaMinor: 50 }],
      };
      const basket = addLine(addLine([], APPLE, 1), withModifier, 1);
      expect(basket).toHaveLength(2);
    });

    it('two modifier-carrying lines for the same variant never merge with each other', () => {
      const lineA = { ...APPLE, lineRef: 'ref-a', modifiers: [{ key: 'a', label: 'A', priceDeltaMinor: 10 }] };
      const lineB = { ...APPLE, lineRef: 'ref-b', modifiers: [{ key: 'b', label: 'B', priceDeltaMinor: 20 }] };
      const basket = addLine(addLine([], lineA, 1), lineB, 1);
      expect(basket).toHaveLength(2);
    });

    it('a non-typed quantity source line never merges into a plain line', () => {
      const scaleLine = { ...APPLE, lineRef: 'ref-2', quantitySource: { source: 'SCALE_WEIGHT' as const } };
      const basket = addLine(addLine([], APPLE, 1), scaleLine, 1);
      expect(basket).toHaveLength(2);
    });

    it('existing no-modifier callers still merge exactly as before', () => {
      const basket = addLine(addLine([], APPLE, 1), APPLE, 2);
      expect(basket).toHaveLength(1);
      expect(basket[0]!.quantity).toBe(3);
    });

    it('setQuantity/removeLine with a lineRef only touch the matching line', () => {
      const plain = APPLE;
      const modified = { ...APPLE, lineRef: 'ref-3', modifiers: [{ key: 'x', label: 'X', priceDeltaMinor: 10 }] };
      let basket = addLine(addLine([], plain, 1), modified, 1);

      basket = setQuantity(basket, 'v1', 5, 'ref-3');
      expect(basket.find((l) => l.lineRef === 'ref-3')?.quantity).toBe(5);
      expect(basket.find((l) => !l.lineRef)?.quantity).toBe(1);

      basket = removeLine(basket, 'v1', 'ref-3');
      expect(basket).toHaveLength(1);
      expect(basket[0]!.lineRef).toBeUndefined();
    });

    it('lineTotal folds modifier price deltas into the per-unit price', () => {
      const line = {
        ...APPLE,
        quantity: 3,
        unitPrice: 100,
        modifiers: [
          { key: 'extra-shot', label: 'Extra shot', priceDeltaMinor: 50 },
          { key: 'large', label: 'Large', priceDeltaMinor: 25 },
        ],
      };
      // (100 + 50 + 25) * 3
      expect(lineTotal(line)).toBe(525);
    });

    it('basketTotals includes every line\'s modifier deltas', () => {
      const plain = { ...APPLE, quantity: 1, unitPrice: 100 };
      const withModifier = {
        ...APPLE,
        variantId: 'v2',
        lineRef: 'ref-4',
        quantity: 2,
        unitPrice: 100,
        modifiers: [{ key: 'extra-shot', label: 'Extra shot', priceDeltaMinor: 50 }],
      };
      const totals = basketTotals([plain, withModifier]);
      // 100*1 + (100+50)*2
      expect(totals.itemsSubtotal).toBe(400);
      expect(totals.grandTotal).toBe(400);
    });
  });
});
