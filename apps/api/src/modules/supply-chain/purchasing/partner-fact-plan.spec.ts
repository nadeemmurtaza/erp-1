import {
  parseSaleFact,
  planSaleFact,
  type KnownVariant,
  type LinkedSupplier,
  type PlanInput,
  type SaleFact,
} from './partner-fact-plan';

const supplier: LinkedSupplier = { id: 'sup1', name: 'Acme Textiles', currency: 'PKR' };
const variant = (overrides: Partial<KnownVariant> = {}): KnownVariant => ({
  id: 'var1',
  costPrice: 340000,
  isActive: true,
  ...overrides,
});

function fact(overrides: Partial<SaleFact> = {}): SaleFact {
  return {
    factId: '3f2c1a4e-8d5b-4c7a-9e11-2a6b7c8d9e01',
    documentRef: 'INV-2026-000412',
    currency: 'PKR',
    lines: [{ gtin: '8901234567890', name: 'Lawn suit, red, M', quantity: 40, unitPriceMinor: 349900, taxMinor: 0 }],
    ...overrides,
  };
}

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    fact: fact(),
    suppliers: [supplier],
    variantsByBarcode: new Map([['8901234567890', variant()]]),
    baseCurrency: 'PKR',
    thresholdPercent: 25,
    ...overrides,
  };
}

describe('planSaleFact', () => {
  describe('when everything checks out', () => {
    it('applies, with the seller price as cost and the totals worked out', () => {
      const plan = planSaleFact(input());

      expect(plan.outcome).toBe('APPLY');
      if (plan.outcome !== 'APPLY') return;
      expect(plan.supplier.id).toBe('sup1');
      expect(plan.lines).toEqual([
        {
          lineIndex: 0,
          variantId: 'var1',
          name: 'Lawn suit, red, M',
          quantity: 40,
          unitPriceMinor: 349900,
          taxMinor: 0,
        },
      ]);
      expect(plan.subtotalMinor).toBe(40 * 349900);
      expect(plan.taxMinor).toBe(0);
      expect(plan.totalMinor).toBe(40 * 349900);
    });

    it('adds tax to the total but never to the unit cost', () => {
      const plan = planSaleFact(
        input({
          fact: fact({
            lines: [{ gtin: '8901234567890', name: 'X', quantity: 10, unitPriceMinor: 349900, taxMinor: 594830 }],
          }),
        }),
      );

      expect(plan.outcome).toBe('APPLY');
      if (plan.outcome !== 'APPLY') return;
      expect(plan.lines[0].unitPriceMinor).toBe(349900);
      expect(plan.subtotalMinor).toBe(3499000);
      expect(plan.taxMinor).toBe(594830);
      expect(plan.totalMinor).toBe(4093830);
    });

    it('applies two lines for the same product as two order lines', () => {
      const line = { gtin: '8901234567890', name: 'X', quantity: 5, unitPriceMinor: 349900, taxMinor: 0 };
      const plan = planSaleFact(input({ fact: fact({ lines: [line, { ...line, quantity: 7 }] }) }));

      expect(plan.outcome).toBe('APPLY');
      if (plan.outcome === 'APPLY') expect(plan.lines.map((l) => l.quantity)).toEqual([5, 7]);
    });

    it('does not flag the price of a product that has no cost yet — there is nothing to compare with', () => {
      const plan = planSaleFact(input({ variantsByBarcode: new Map([['8901234567890', variant({ costPrice: 0 })]]) }));
      expect(plan.outcome).toBe('APPLY');
    });
  });

  describe('the supplier', () => {
    it('holds the fact when no active supplier is linked', () => {
      const plan = planSaleFact(input({ suppliers: [] }));

      expect(plan.outcome).toBe('REVIEW');
      expect(plan.reasons[0]).toMatch(/No active supplier is linked/);
    });

    it('holds the fact, naming them, when several are linked — it will not guess whose order it is', () => {
      const plan = planSaleFact(
        input({ suppliers: [supplier, { id: 'sup2', name: 'Beta Fabrics', currency: 'PKR' }] }),
      );

      expect(plan.outcome).toBe('REVIEW');
      expect(plan.reasons[0]).toMatch(/Acme Textiles, Beta Fabrics/);
    });
  });

  describe('the currency', () => {
    it('holds a foreign-currency fact: a bill in another currency needs an exchange rate a fact does not carry', () => {
      const plan = planSaleFact(input({ fact: fact({ currency: 'USD' }) }));

      expect(plan.outcome).toBe('REVIEW');
      expect(plan.reasons.join(' ')).toMatch(/USD.*PKR only/);
    });

    it('holds a fact whose currency differs from the supplier billing currency', () => {
      const plan = planSaleFact(input({ suppliers: [{ ...supplier, currency: 'USD' }] }));

      expect(plan.outcome).toBe('REVIEW');
      expect(plan.reasons.join(' ')).toMatch(/set up to bill in USD/);
    });
  });

  describe('matching lines to products', () => {
    it('holds a line with no barcode, and never falls back to the seller SKU', () => {
      const line = { sellerSku: 'LWN-RED-M', name: 'Lawn suit', quantity: 1, unitPriceMinor: 100, taxMinor: 0 };
      // A variant whose SKU happens to equal the seller's must not be picked up.
      const plan = planSaleFact(input({ fact: fact({ lines: [line] }) }));

      expect(plan.outcome).toBe('REVIEW');
      expect(plan.lineOutcomes[0].status).toBe('NO_BARCODE');
      expect(plan.reasons[0]).toMatch(/Line 1.*no barcode/);
    });

    it('holds a barcode we do not know, and says how to fix it', () => {
      const plan = planSaleFact(input({ variantsByBarcode: new Map() }));

      expect(plan.outcome).toBe('REVIEW');
      expect(plan.lineOutcomes[0].status).toBe('UNKNOWN_BARCODE');
      expect(plan.reasons[0]).toMatch(/8901234567890.*shared listing/);
    });

    it('holds a line for an inactive product', () => {
      const plan = planSaleFact(
        input({ variantsByBarcode: new Map([['8901234567890', variant({ isActive: false })]]) }),
      );

      expect(plan.outcome).toBe('REVIEW');
      expect(plan.lineOutcomes[0].status).toBe('INACTIVE_PRODUCT');
    });

    it('holds the WHOLE fact when only one of several lines is unknown — nothing is partially applied', () => {
      const good = { gtin: '8901234567890', name: 'Known', quantity: 1, unitPriceMinor: 349900, taxMinor: 0 };
      const bad = { gtin: '4006381333931', name: 'Unknown', quantity: 1, unitPriceMinor: 100, taxMinor: 0 };
      const plan = planSaleFact(input({ fact: fact({ lines: [good, bad] }) }));

      expect(plan.outcome).toBe('REVIEW');
      expect(plan.lineOutcomes.map((o) => o.status)).toEqual(['MATCHED', 'UNKNOWN_BARCODE']);
      expect(plan.reasons).toHaveLength(1);
      expect(plan.reasons[0]).toMatch(/Line 2/);
    });

    it('names a long product name shortened, so a reason stays readable', () => {
      const plan = planSaleFact(
        input({
          variantsByBarcode: new Map(),
          fact: fact({
            lines: [{ gtin: '8901234567890', name: 'N'.repeat(200), quantity: 1, unitPriceMinor: 1, taxMinor: 0 }],
          }),
        }),
      );
      expect(plan.reasons[0].length).toBeLessThan(200);
    });
  });

  describe('the price review', () => {
    const at = (price: number) =>
      planSaleFact(
        input({
          fact: fact({
            lines: [{ gtin: '8901234567890', name: 'X', quantity: 1, unitPriceMinor: price, taxMinor: 0 }],
          }),
        }),
      );

    it.each([
      ['exactly at the limit', 425000], // 340000 * 1.25
      ['an ordinary rise', 360000],
      ['a fall within the limit', 300000],
    ])('applies a price %s', (_label, price) => {
      expect(at(price).outcome).toBe('APPLY');
    });

    it.each([
      ['a decimal slip (ten times)', 3400000, 'above'],
      ['one unit over the limit', 425001 + 4250, 'above'],
      ['a price far below', 100000, 'below'],
    ])('holds %s', (_label, price, direction) => {
      const plan = at(price);

      expect(plan.outcome).toBe('REVIEW');
      expect(plan.reasons[0]).toContain(direction);
      expect(plan.reasons[0]).toMatch(/review limit 25%/);
    });

    it('records the delta on a matched line even when it is fine, for a screen to show', () => {
      expect(at(360000).lineOutcomes[0].priceDeltaPercent).toBe(6);
    });

    it('switches the check off at 0', () => {
      const plan = planSaleFact(
        input({
          thresholdPercent: 0,
          fact: fact({
            lines: [{ gtin: '8901234567890', name: 'X', quantity: 1, unitPriceMinor: 3400000, taxMinor: 0 }],
          }),
        }),
      );
      expect(plan.outcome).toBe('APPLY');
    });
  });

  describe('figures that cannot be recorded', () => {
    it('holds a line whose total exceeds what the database can store', () => {
      const plan = planSaleFact(
        input({
          thresholdPercent: 0,
          fact: fact({
            lines: [
              { gtin: '8901234567890', name: 'X', quantity: 1_000_000, unitPriceMinor: 2_000_000_000, taxMinor: 0 },
            ],
          }),
        }),
      );

      expect(plan.outcome).toBe('REVIEW');
      expect(plan.reasons.join(' ')).toMatch(/too large/);
    });

    it('holds a fact whose lines are each fine but together are too large', () => {
      const line = { gtin: '8901234567890', name: 'X', quantity: 1, unitPriceMinor: 1_500_000_000, taxMinor: 0 };
      const plan = planSaleFact(input({ thresholdPercent: 0, fact: fact({ lines: [line, line] }) }));

      expect(plan.outcome).toBe('REVIEW');
      expect(plan.reasons.join(' ')).toMatch(/fact total is too large/);
    });
  });

  it('lists every problem at once, so an operator fixes them in one pass', () => {
    const plan = planSaleFact(input({ suppliers: [], fact: fact({ currency: 'USD' }), variantsByBarcode: new Map() }));

    expect(plan.outcome).toBe('REVIEW');
    expect(plan.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it('is pure: the same input gives the same plan and the input is not changed', () => {
    const i = input();
    const before = JSON.stringify([i.fact, i.suppliers, [...i.variantsByBarcode]]);

    expect(planSaleFact(i)).toEqual(planSaleFact(i));
    expect(JSON.stringify([i.fact, i.suppliers, [...i.variantsByBarcode]])).toBe(before);
  });
});

describe('parseSaleFact', () => {
  const stored = () => ({
    factId: 'f1',
    type: 'sale.dispatched',
    schemaVersion: 1,
    currency: 'PKR',
    documentRef: 'INV-1',
    occurredAt: '2026-09-30T09:14:00Z',
    lines: [{ gtin: '8901234567890', name: 'Lawn suit', quantity: 2, unitPriceMinor: 100 }],
  });

  it('reads a stored payload and defaults a missing tax to 0', () => {
    expect(parseSaleFact(stored())).toEqual({
      factId: 'f1',
      documentRef: 'INV-1',
      currency: 'PKR',
      lines: [
        {
          gtin: '8901234567890',
          sellerSku: undefined,
          name: 'Lawn suit',
          quantity: 2,
          unitPriceMinor: 100,
          taxMinor: 0,
        },
      ],
    });
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['no lines', { ...stored(), lines: [] }],
    ['lines that are not an array', { ...stored(), lines: {} }],
    ['no currency', { ...stored(), currency: undefined }],
    ['a zero quantity', { ...stored(), lines: [{ name: 'X', quantity: 0, unitPriceMinor: 1 }] }],
    ['a fractional price', { ...stored(), lines: [{ name: 'X', quantity: 1, unitPriceMinor: 1.5 }] }],
    ['a negative tax', { ...stored(), lines: [{ name: 'X', quantity: 1, unitPriceMinor: 1, taxMinor: -1 }] }],
    ['a line with no name', { ...stored(), lines: [{ quantity: 1, unitPriceMinor: 1 }] }],
  ])('returns null for %s rather than guessing', (_label, payload) => {
    expect(parseSaleFact(payload)).toBeNull();
  });
});
