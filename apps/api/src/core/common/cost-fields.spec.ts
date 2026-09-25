import { stripCodRiskFields, stripCodRiskFieldsList } from './cost-fields';

describe('stripCodRiskFields', () => {
  it('removes every COD-risk field from an order, unconditionally', () => {
    const order = {
      id: 'o1',
      codRiskScore: 72,
      codRiskAction: 'REQUIRE_ADVANCE_PAYMENT',
      codRiskReasonEn: 'This phone has returned 3 of its last 4 orders (75%).',
      codRiskComputedAt: new Date().toISOString(),
    };

    const result = stripCodRiskFields(order) as Record<string, unknown>;

    expect(result.codRiskScore).toBeUndefined();
    expect(result.codRiskAction).toBeUndefined();
    expect(result.codRiskReasonEn).toBeUndefined();
    expect(result.codRiskComputedAt).toBeUndefined();
    expect(result.id).toBe('o1');
  });

  it('is a no-op for an order that never had a score (non-COD, or placed before this feature)', () => {
    const order = { id: 'o1', codRiskScore: null, codRiskAction: null, codRiskReasonEn: null, codRiskComputedAt: null };

    expect(() => stripCodRiskFields(order)).not.toThrow();
  });
});

describe('stripCodRiskFieldsList', () => {
  it('strips COD-risk fields from every order in a paginated list', () => {
    const result = stripCodRiskFieldsList({
      data: [
        { id: 'o1', codRiskScore: 80, codRiskAction: 'REQUIRE_ADVANCE_PAYMENT' },
        { id: 'o2', codRiskScore: 10, codRiskAction: 'AUTO_CONFIRM' },
      ],
    }) as { data: Array<Record<string, unknown>> };

    for (const order of result.data) {
      expect(order.codRiskScore).toBeUndefined();
      expect(order.codRiskAction).toBeUndefined();
    }
  });
});
