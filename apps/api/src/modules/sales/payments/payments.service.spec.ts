import { PaymentsService } from './payments.service';
import { CircuitBreakerService } from '../../../core/resilience/circuit-breaker.service';
import type { PaymentContext } from './payment-provider';

function fakeProvider(key: string) {
  return {
    key,
    labelEn: key,
    labelUr: key,
    descriptionEn: key,
    descriptionUr: key,
    feeFor: jest.fn().mockResolvedValue(0),
    initiate: jest.fn(),
  };
}

const CONTEXT: PaymentContext = {
  orderId: 'order-1',
  orderNumber: 'ORD-1',
  amount: 10_000,
  customerName: 'Test Customer',
  customerPhone: '+923001234567',
  customerEmail: null,
};

describe('PaymentsService.createForOrder — 38-resilience-engineering.md WO-38.1/38.2', () => {
  let cod: ReturnType<typeof fakeProvider>;
  let easypaisa: ReturnType<typeof fakeProvider>;
  let prisma: any;
  let events: any;
  let audit: any;
  let storage: any;
  let circuitBreaker: CircuitBreakerService;
  let service: PaymentsService;

  beforeEach(() => {
    cod = fakeProvider('cod');
    easypaisa = fakeProvider('easypaisa');
    prisma = { payment: { create: jest.fn().mockResolvedValue({ id: 'pay-1' }) } };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    audit = {};
    storage = {};
    circuitBreaker = new CircuitBreakerService();

    const config = { isPaymentProviderEnabled: () => true };

    service = new PaymentsService(
      prisma,
      events,
      audit,
      storage,
      circuitBreaker,
      config as any,
      cod as any,
      fakeProvider('bank_transfer') as any,
      fakeProvider('jazzcash') as any,
      easypaisa as any,
      fakeProvider('giftkarta') as any,
      fakeProvider('account') as any,
    );
  });

  it('degradation matrix row "PaymentProvider down": a specific provider failing repeatedly opens only ITS OWN circuit — cash tender and every other configured provider are unaffected', async () => {
    easypaisa.initiate.mockRejectedValue(new Error('gateway timeout'));
    cod.initiate.mockResolvedValue({ status: 'PENDING', reference: 'cod-ref', redirectUrl: null });

    for (let i = 0; i < 5; i++) {
      await expect(service.createForOrder(prisma, 'easypaisa', CONTEXT)).rejects.toThrow('gateway timeout');
    }
    expect(circuitBreaker.getSnapshot('payment.easypaisa').state).toBe('OPEN');

    // COD (and, by the same independent-key design, every other provider)
    // is a completely separate circuit — never affected by Easypaisa's own.
    const result = await service.createForOrder(prisma, 'cod', CONTEXT);
    expect(result.paymentId).toBe('pay-1');
    expect(circuitBreaker.getSnapshot('payment.cod').state).toBe('CLOSED');
    expect(cod.initiate).toHaveBeenCalledTimes(1);
  });

  it('once OPEN, a further attempt against the down provider fails fast without calling it again', async () => {
    easypaisa.initiate.mockRejectedValue(new Error('gateway timeout'));
    for (let i = 0; i < 5; i++) {
      await expect(service.createForOrder(prisma, 'easypaisa', CONTEXT)).rejects.toThrow();
    }
    expect(easypaisa.initiate).toHaveBeenCalledTimes(5);

    await expect(service.createForOrder(prisma, 'easypaisa', CONTEXT)).rejects.toThrow(/Circuit "payment.easypaisa" is open/);
    expect(easypaisa.initiate).toHaveBeenCalledTimes(5);
  });
});
