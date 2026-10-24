import { Test } from '@nestjs/testing';
import { FinanceListener } from './finance.listener';
import { OrderEconomicsService } from './order-economics.service';
import type { OrderStatusChangedPayload } from '../../core/events/domain-events';

/**
 * WO-23.1's WO-B.3. OrderEconomicsService does the real work
 * (order-economics.service.spec.ts); this only checks that the listener
 * routes each status to the right call — and, just as importantly, to no
 * call at all for everything else, including CANCELLED (which the acceptance
 * criteria say must get no row).
 */
describe('FinanceListener', () => {
  let listener: FinanceListener;
  let orderEconomics: { computeForOrder: jest.Mock };

  beforeEach(async () => {
    orderEconomics = { computeForOrder: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [FinanceListener, { provide: OrderEconomicsService, useValue: orderEconomics }],
    }).compile();

    listener = module.get(FinanceListener);
  });

  function payload(toStatus: string): OrderStatusChangedPayload {
    return { orderId: 'order-1', orderNumber: 'ORD-1', fromStatus: 'SHIPPED', toStatus, actorId: null };
  }

  it('computes fresh economics on DELIVERED', async () => {
    await listener.onOrderStatusChanged(payload('DELIVERED'));
    expect(orderEconomics.computeForOrder).toHaveBeenCalledWith('order-1', false);
  });

  it('recomputes with revenue and cogs zeroed on RETURNED', async () => {
    await listener.onOrderStatusChanged(payload('RETURNED'));
    expect(orderEconomics.computeForOrder).toHaveBeenCalledWith('order-1', true);
  });

  it.each(['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'CANCELLED'])(
    'does nothing on %s — no row for a status that never earns one',
    async (toStatus) => {
      await listener.onOrderStatusChanged(payload(toStatus));
      expect(orderEconomics.computeForOrder).not.toHaveBeenCalled();
    },
  );
});
