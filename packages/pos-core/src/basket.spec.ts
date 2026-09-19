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
});
