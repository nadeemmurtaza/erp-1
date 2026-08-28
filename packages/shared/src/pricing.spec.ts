import {
  computeLineItem,
  computeOrderTotals,
  computeShippingFee,
  computeStitchingFee,
  lineMargin,
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

describe('lineMargin', () => {
  it('computes margin as lineTotal minus total cost', () => {
    // 2 units at Rs 4500 each, cost is Rs 3000 each = Rs 3000 margin
    expect(lineMargin(toMinor(9000), toMinor(3000), 2)).toBe(toMinor(3000));
  });

  it('supports negative margin if sold below cost', () => {
    // 1 unit sold for Rs 1000, cost is Rs 1500 = -Rs 500 margin
    expect(lineMargin(toMinor(1000), toMinor(1500), 1)).toBe(toMinor(-500));
  });

  it('returns exactly the line total when cost is zero', () => {
    expect(lineMargin(toMinor(5000), 0, 1)).toBe(toMinor(5000));
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


describe('allocateLandedCost', () => {
  it('allocates freight proportionally and fixes rounding drift', () => {
    const { allocateLandedCost } = require('./pricing');
    // 1000 across 333, 333, 334
    const lines = [
      { quantity: 1, unitCost: 333 },
      { quantity: 1, unitCost: 333 },
      { quantity: 1, unitCost: 334 },
    ];
    const shares = allocateLandedCost(lines, 1000);
    expect(shares[0] + shares[1] + shares[2]).toBe(1000);
    expect(shares).toEqual([333, 333, 334]);
  });

  it('allocates to highest quantity when value is zero', () => {
    const { allocateLandedCost } = require('./pricing');
    const lines = [
      { quantity: 2, unitCost: 0 },
      { quantity: 5, unitCost: 0 },
      { quantity: 1, unitCost: 0 },
    ];
    const shares = allocateLandedCost(lines, 1000);
    expect(shares).toEqual([0, 1000, 0]);
  });
});

describe('weightedAverageCost', () => {
  it('returns landed cost on first receipt or when stock < 0', () => {
    const { weightedAverageCost } = require('./pricing');
    expect(weightedAverageCost(0, 500, 10, 600)).toBe(600);
    expect(weightedAverageCost(-5, 500, 10, 600)).toBe(600);
  });

  it('returns landed cost when current cost is 0', () => {
    const { weightedAverageCost } = require('./pricing');
    expect(weightedAverageCost(5, 0, 10, 600)).toBe(600);
  });

  it('averages properly', () => {
    const { weightedAverageCost } = require('./pricing');
    // 10 @ 500 = 5000
    // 10 @ 700 = 7000
    // total = 12000 / 20 = 600
    expect(weightedAverageCost(10, 500, 10, 700)).toBe(600);
  });
});

