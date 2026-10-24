import { computeMarkdownSuggestion, type MarkdownSuggestionInput } from './markdown-suggestion';

function baseInput(overrides: Partial<MarkdownSuggestionInput> = {}): MarkdownSuggestionInput {
  return {
    stock: 30,
    costPricePaisa: 100000,
    currentPricePaisa: 200000,
    units90: 3,
    velocityMultiplierPer10Pct: 1.4,
    targetClearancePct: 60,
    minMarginBps: 0,
    ...overrides,
  };
}

describe('computeMarkdownSuggestion', () => {
  it('returns null when there is no stock', () => {
    expect(computeMarkdownSuggestion(baseInput({ stock: 0 }))).toBeNull();
  });

  it('returns null when cost is unknown (0 = never received against a PO)', () => {
    expect(computeMarkdownSuggestion(baseInput({ costPricePaisa: 0 }))).toBeNull();
  });

  it('returns null when the selling price is non-positive', () => {
    expect(computeMarkdownSuggestion(baseInput({ currentPricePaisa: 0 }))).toBeNull();
  });

  it('picks the shallowest discount that reaches the target clearance ("least margin loss")', () => {
    // baseline daily rate = 3/90 = 0.0333/day. At 30% off, multiplier =
    // 1.4^3 = 2.744, dailyRate ≈ 0.0915, 30-day clearance ≈ 9.15%.
    // Reaching 60% clearance on 30 units needs a much higher rate — pick a
    // small stock so a modest discount clears the target.
    const result = computeMarkdownSuggestion(baseInput({ stock: 2, units90: 9, targetClearancePct: 60 }));
    expect(result).not.toBeNull();
    // baseline = 9/90 = 0.1/day. At 10% off: multiplier 1.4^1=1.4, rate=0.14,
    // 30-day clearance = 0.14*30/2*100 = 210% -> capped at 100, well over 60.
    expect(result!.suggestedBps).toBe(1000);
  });

  it('falls back to the deepest candidate when nothing reaches the target', () => {
    // No sales at all in 90 days -> every candidate's dailyRate is 0 -> 0% clearance for all.
    const result = computeMarkdownSuggestion(baseInput({ units90: 0, targetClearancePct: 60 }));
    expect(result).not.toBeNull();
    expect(result!.suggestedBps).toBe(5000);
    expect(result!.estimatedClearancePct).toBe(0);
  });

  it('reports margin before and after in paisa, per unit', () => {
    const result = computeMarkdownSuggestion(baseInput({ costPricePaisa: 100000, currentPricePaisa: 200000, stock: 2, units90: 9 }));
    expect(result!.marginBeforePaisa).toBe(100000);
    // 10% off 200000 = 180000, minus cost 100000 = 80000
    expect(result!.marginAfterPaisa).toBe(80000);
  });

  it('never offers a candidate below the margin floor, even if it would clear fastest', () => {
    // 50% off 200000 = 100000, margin = 0 (0 bps of its own price) — exactly
    // at a 0 floor is fine, but push the floor above zero to exclude it.
    const result = computeMarkdownSuggestion(
      baseInput({ costPricePaisa: 100000, currentPricePaisa: 200000, minMarginBps: 500, stock: 2, units90: 9 }),
    );
    expect(result).not.toBeNull();
    // 50% off would have 0 margin (0 bps) < 500 floor, so it must be excluded
    // from the ladder entirely, whatever clearance it reaches.
    expect(result!.suggestedBps).not.toBe(5000);
  });

  it('returns null when every candidate on the ladder violates the margin floor', () => {
    // cost is 95% of price -- even 10% off drops margin negative.
    const result = computeMarkdownSuggestion(
      baseInput({ costPricePaisa: 190000, currentPricePaisa: 200000, minMarginBps: 0 }),
    );
    expect(result).toBeNull();
  });

  it('caps estimated clearance percentage at 100', () => {
    const result = computeMarkdownSuggestion(baseInput({ stock: 1, units90: 90, targetClearancePct: 60 }));
    expect(result!.estimatedClearancePct).toBeLessThanOrEqual(100);
  });

  it('is deterministic for the same input', () => {
    const input = baseInput();
    expect(computeMarkdownSuggestion(input)).toEqual(computeMarkdownSuggestion(input));
  });
});
