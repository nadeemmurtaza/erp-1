import { computeCodRiskScore, type CodRiskInput } from './cod-risk';

const THRESHOLDS = { confirmationCall: 35, advancePayment: 65 };

function baseInput(overrides: Partial<CodRiskInput> = {}): CodRiskInput {
  return {
    address: { line1: 'House 12, Street 5, Sector G-9', line2: 'Near City Park', postalCode: '44000', phone: '03001234567' },
    orderValue: 500_00,
    hasAccount: true,
    localHour: 14,
    cityStats: null,
    customerHistory: null,
    thresholds: THRESHOLDS,
    ...overrides,
  };
}

describe('computeCodRiskScore', () => {
  it('auto-confirms a clean, well-detailed, repeat-customer order', () => {
    const result = computeCodRiskScore(
      baseInput({ customerHistory: { orderCount: 4, rtoCount: 0 } }),
    );

    expect(result.action).toBe('AUTO_CONFIRM');
    expect(result.score).toBe(0);
    expect(result.reasonEn).toContain('Reliable repeat customer');
  });

  it('flags a brand-new phone number as a mild, not dominant, signal', () => {
    const result = computeCodRiskScore(baseInput({ customerHistory: null }));

    expect(result.score).toBe(12);
    expect(result.action).toBe('AUTO_CONFIRM');
    expect(result.reasonEn).toContain('New customer');
  });

  it('requires advance payment when a heavy RTO history stacks with other risk signals', () => {
    const result = computeCodRiskScore(
      baseInput({
        customerHistory: { orderCount: 4, rtoCount: 3 }, // +50, the single dominant signal
        hasAccount: false, // +5
        localHour: 2, // +8
        address: { ...baseInput().address, phone: '02112345678' }, // +10, non-mobile
      }),
    );

    expect(result.score).toBeGreaterThanOrEqual(THRESHOLDS.advancePayment);
    expect(result.action).toBe('REQUIRE_ADVANCE_PAYMENT');
    expect(result.reasonEn).toContain('returned 3 of its last 4 orders');
  });

  it('recommends a confirmation call for a moderate RTO rate stacked with one more signal', () => {
    const result = computeCodRiskScore(
      baseInput({
        customerHistory: { orderCount: 4, rtoCount: 1 }, // +30
        hasAccount: false, // +5 -> crosses the confirmationCall threshold (35)
      }),
    );

    expect(result.action).toBe('CONFIRMATION_CALL');
  });

  it('leaves a lone moderate-RTO signal at auto-confirm when nothing else stacks', () => {
    const result = computeCodRiskScore(
      baseInput({ customerHistory: { orderCount: 4, rtoCount: 1 } }), // +30, below the 35 threshold alone
    );

    expect(result.score).toBe(30);
    expect(result.action).toBe('AUTO_CONFIRM');
  });

  it('never trusts city stats below the caller\'s own minimum sample — cityStats is null', () => {
    const result = computeCodRiskScore(baseInput({ cityStats: null, orderValue: 10_000_00 }));

    // No city signal contributes at all, however large the order — only the
    // flat new-customer bump (cityStats: null, the default) remains.
    expect(result.score).toBe(12);
  });

  it('flags a high city RTO rate', () => {
    const result = computeCodRiskScore(
      baseInput({ cityStats: { rtoRatePercent: 35, avgOrderValue: 500_00 } }),
    );

    expect(result.reasonEn).toContain("city's COD return rate");
  });

  it('rewards a reliably low-RTO city with a small negative contribution', () => {
    const withGoodCity = computeCodRiskScore(
      baseInput({ cityStats: { rtoRatePercent: 2, avgOrderValue: 500_00 } }),
    );
    const withNoCityData = computeCodRiskScore(baseInput({ cityStats: null }));

    expect(withGoodCity.score).toBeLessThan(withNoCityData.score);
  });

  it('flags an order far above the city\'s average value', () => {
    const result = computeCodRiskScore(
      baseInput({ orderValue: 2_000_00, cityStats: { rtoRatePercent: 10, avgOrderValue: 500_00 } }),
    );

    expect(result.reasonEn).toContain("this city's average");
  });

  it('flags an invalid phone number as the dominant reason', () => {
    const result = computeCodRiskScore(baseInput({ address: { ...baseInput().address, phone: '123' } }));

    expect(result.reasonEn).toBe('The delivery phone number does not look valid.');
  });

  it('flags a landline (non-mobile) delivery phone', () => {
    const result = computeCodRiskScore(
      baseInput({
        address: { ...baseInput().address, phone: '02112345678' },
        customerHistory: { orderCount: 1, rtoCount: 0 },
      }),
    );

    expect(result.reasonEn).toContain('not a mobile number');
  });

  it('flags a very short street address', () => {
    const result = computeCodRiskScore(
      baseInput({
        address: { line1: 'abc', line2: null, postalCode: null, phone: '03001234567' },
        customerHistory: { orderCount: 1, rtoCount: 0 },
      }),
    );

    expect(result.reasonEn).toBe('The street address is very short.');
  });

  it('gives a mild bump to an address with no landmark or postal code, distinct from a too-short one', () => {
    const result = computeCodRiskScore(
      baseInput({
        address: { line1: 'House 12, Street 5, Sector G-9', line2: null, postalCode: null, phone: '03001234567' },
        customerHistory: { orderCount: 1, rtoCount: 0 },
      }),
    );

    expect(result.reasonEn).toBe('The address has no landmark or postal code.');
  });

  it('flags a late-night order', () => {
    const result = computeCodRiskScore(
      baseInput({ localHour: 2, customerHistory: { orderCount: 1, rtoCount: 0 } }),
    );

    expect(result.reasonEn).toBe('Placed late at night.');
  });

  it('never flags a normal daytime hour', () => {
    const result = computeCodRiskScore(baseInput({ localHour: 14, hasAccount: true, customerHistory: { orderCount: 3, rtoCount: 0 } }));

    expect(result.reasonEn).not.toContain('night');
  });

  it('gives a small bump to a guest checkout', () => {
    const result = computeCodRiskScore(baseInput({ hasAccount: false, customerHistory: { orderCount: 1, rtoCount: 0 } }));

    expect(result.reasonEn).toContain('Guest checkout');
  });

  it('never returns a negative score even when every discount signal stacks', () => {
    const result = computeCodRiskScore(
      baseInput({
        customerHistory: { orderCount: 10, rtoCount: 0 },
        cityStats: { rtoRatePercent: 1, avgOrderValue: 500_00 },
      }),
    );

    expect(result.score).toBe(0);
  });

  it('never returns a score above 100 even when every risk signal stacks', () => {
    const result = computeCodRiskScore({
      address: { line1: 'x', line2: null, postalCode: null, phone: 'not-a-phone' },
      orderValue: 5_000_00,
      hasAccount: false,
      localHour: 3,
      cityStats: { rtoRatePercent: 40, avgOrderValue: 100_00 },
      customerHistory: { orderCount: 2, rtoCount: 2 },
      thresholds: THRESHOLDS,
    });

    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.action).toBe('REQUIRE_ADVANCE_PAYMENT');
  });

  it('reports "no notable risk signals" only when nothing at all fired', () => {
    const result = computeCodRiskScore(
      baseInput({ customerHistory: { orderCount: 1, rtoCount: 0 }, hasAccount: true }),
    );

    expect(result.reasonEn).toBe('No notable risk signals.');
    expect(result.score).toBe(0);
  });
});
