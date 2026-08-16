import {
  computeLineItem,
  computeOrderTotals,
  computeShippingFee,
  computeStitchingFee,
} from './pricing';
import { formatMoney, toMinor } from './constants';

describe('computeStitchingFee', () => {
  it('adds option deltas to the base fee', () => {
    // Rs 1,200 stitching + Rs 250 embroidered neckline + Rs 150 lining
    expect(
      computeStitchingFee({
        baseFee: toMinor(1200),
        optionDeltas: [toMinor(250), toMinor(150)],
      }),
    ).toBe(toMinor(1600));
  });

  it('supports negative deltas for cheaper options', () => {
    expect(
      computeStitchingFee({ baseFee: toMinor(1200), optionDeltas: [toMinor(-200)] }),
    ).toBe(toMinor(1000));
  });

  it('never returns a negative fee', () => {
    expect(
      computeStitchingFee({ baseFee: toMinor(500), optionDeltas: [toMinor(-900)] }),
    ).toBe(0);
  });

  it('is just the base fee when no options are chosen', () => {
    expect(computeStitchingFee({ baseFee: toMinor(1200), optionDeltas: [] })).toBe(
      toMinor(1200),
    );
  });
});

describe('computeLineItem', () => {
  it('prices unstitched fabric with stitching added, per unit', () => {
    const line = computeLineItem({
      unitPrice: toMinor(4500),
      quantity: 2,
      stitchingFeePerUnit: toMinor(1600),
    });

    expect(line.productTotal).toBe(toMinor(9000));
    expect(line.stitchingTotal).toBe(toMinor(3200));
    expect(line.lineTotal).toBe(toMinor(12200));
  });

  it('prices a ready-made piece with no stitching', () => {
    const line = computeLineItem({ unitPrice: toMinor(6999), quantity: 1 });
    expect(line.stitchingTotal).toBe(0);
    expect(line.lineTotal).toBe(toMinor(6999));
  });

  it('caps the discount at the value of the line', () => {
    const line = computeLineItem({
      unitPrice: toMinor(1000),
      quantity: 1,
      discountPerUnit: toMinor(5000),
    });
    expect(line.lineTotal).toBe(0);
  });

  it('treats a fractional quantity as whole units', () => {
    const line = computeLineItem({ unitPrice: toMinor(1000), quantity: 2.7 });
    expect(line.productTotal).toBe(toMinor(2000));
  });
});

describe('computeOrderTotals', () => {
  it('sums goods, stitching, shipping and the COD fee', () => {
    const totals = computeOrderTotals({
      items: [
        // 3-piece unstitched lawn + stitching
        { unitPrice: toMinor(4500), quantity: 1, stitchingFeePerUnit: toMinor(1600) },
        // ready-made kurta
        { unitPrice: toMinor(2999), quantity: 2 },
      ],
      shippingFee: toMinor(250),
      codFee: toMinor(100),
    });

    expect(totals.itemsSubtotal).toBe(toMinor(10498));
    expect(totals.stitchingSubtotal).toBe(toMinor(1600));
    expect(totals.grandTotal).toBe(toMinor(12448));
  });

  it('caps an order discount at the value of the goods, sparing shipping', () => {
    const totals = computeOrderTotals({
      items: [{ unitPrice: toMinor(1000), quantity: 1 }],
      orderDiscount: toMinor(9999),
      shippingFee: toMinor(250),
    });

    expect(totals.orderDiscount).toBe(toMinor(1000));
    expect(totals.grandTotal).toBe(toMinor(250));
  });

  it('is zero for an empty cart', () => {
    expect(computeOrderTotals({ items: [] }).grandTotal).toBe(0);
  });
});

describe('computeShippingFee', () => {
  it('charges the zone rate below the free-shipping threshold', () => {
    expect(
      computeShippingFee(toMinor(2000), { fee: toMinor(250), freeAbove: toMinor(5000) }),
    ).toBe(toMinor(250));
  });

  it('is free at or above the threshold', () => {
    expect(
      computeShippingFee(toMinor(5000), { fee: toMinor(250), freeAbove: toMinor(5000) }),
    ).toBe(0);
  });

  it('ignores the threshold when it is not configured', () => {
    expect(computeShippingFee(toMinor(999999), { fee: toMinor(400) })).toBe(toMinor(400));
  });
});

describe('formatMoney', () => {
  it('renders whole rupees without decimals', () => {
    // Intl inserts a non-breaking space after the currency symbol.
    expect(formatMoney(toMinor(3499)).replace(/\s/g, ' ')).toBe('Rs 3,499');
  });
});
