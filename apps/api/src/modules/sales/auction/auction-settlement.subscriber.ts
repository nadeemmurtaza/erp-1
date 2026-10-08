import { Injectable } from '@nestjs/common';
import {
  DomainEvent,
  type AuctionLotClosedPayload,
  type OrderStatusChangedPayload,
  type PaymentPayload,
} from '../../../core/events/domain-events';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import { AuctionSettlementService } from './auction-settlement.service';

/**
 * The three things auction settlement hears (doc 234 §9, WO-234.6): a lot
 * closed, a payment succeeded, an order was cancelled. Every handler is
 * idempotent by predicate inside the service, which is what lets the outbox
 * deliver any of them twice, or the sweep act on the same debt, without a double
 * invoice, a double count, or a double strike. A handler that throws is retried
 * by the outbox; one that returns has finished.
 */
@Injectable()
export class AuctionSettlementSubscriber {
  constructor(private readonly settlement: AuctionSettlementService) {}

  @OnDomainEvent(DomainEvent.AuctionLotClosed)
  onLotClosed(payload: AuctionLotClosedPayload): Promise<void> {
    return this.settlement.onLotClosed(payload);
  }

  @OnDomainEvent(DomainEvent.PaymentSucceeded)
  onPaymentSucceeded(payload: PaymentPayload): Promise<void> {
    return this.settlement.onPaymentSucceeded(payload);
  }

  @OnDomainEvent(DomainEvent.OrderCancelled)
  onOrderCancelled(payload: OrderStatusChangedPayload): Promise<void> {
    return this.settlement.onOrderCancelled(payload.orderId);
  }
}
