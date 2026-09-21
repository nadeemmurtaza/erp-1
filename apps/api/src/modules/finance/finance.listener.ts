import { Injectable } from '@nestjs/common';
import { DomainEvent, type OrderStatusChangedPayload } from '../../core/events/domain-events';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { OrderEconomicsService } from './order-economics.service';

/**
 * WO-23.1's WO-B.3: compute OrderEconomics on DELIVERED, recompute on
 * RETURNED. Every other transition — including CANCELLED, which fires
 * DomainEvent.OrderCancelled rather than this event (see
 * OrderStatusChangedPayload's own note in orders/notification.subscriber.ts)
 * — gets no row at all, so this listener does not subscribe to
 * OrderCancelled: there is nothing for it to do.
 */
@Injectable()
export class FinanceListener {
  constructor(private readonly orderEconomics: OrderEconomicsService) {}

  @OnDomainEvent(DomainEvent.OrderStatusChanged)
  async onOrderStatusChanged(payload: OrderStatusChangedPayload): Promise<void> {
    if (payload.toStatus === 'DELIVERED') {
      await this.orderEconomics.computeForOrder(payload.orderId, false);
    } else if (payload.toStatus === 'RETURNED') {
      await this.orderEconomics.computeForOrder(payload.orderId, true);
    }
  }
}
