import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import { DomainEvent, type PartnerFactReceivedPayload } from '../../../core/events/domain-events';
import { PartnerFactApplierService } from './partner-fact-applier.service';

/**
 * Applies a connected partner's `sale.dispatched` fact the moment it is stored
 * (WO-213.2). The work is in `PartnerFactApplierService`; this only routes the
 * event. A `receipt.confirmed` fact is the SELLER's concern and is handled by
 * the trading-partner work of WO-213.4, so it is ignored here.
 *
 * At-least-once delivery is safe: applying the same fact twice is a no-op.
 * If `purchasing` is not enabled this listener does not exist, the fact stays
 * RECEIVED, and nothing fails.
 */
@Injectable()
export class PartnerFactListener {
  constructor(private readonly applier: PartnerFactApplierService) {}

  @OnDomainEvent(DomainEvent.PartnerFactReceived)
  async onPartnerFactReceived(payload: PartnerFactReceivedPayload): Promise<void> {
    if (payload.type !== 'sale.dispatched') return;
    await this.applier.apply(payload.inboxId);
  }
}
