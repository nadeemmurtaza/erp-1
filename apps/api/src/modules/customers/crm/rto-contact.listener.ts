import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, type ShipmentReturnedToOriginPayload } from '../../../core/events/domain-events';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import { PrismaService } from '../../../core/prisma/prisma.service';

/**
 * WO-6.7 — "Increment an RTO counter on the customer's Contact record."
 * Same rollup idiom as the CRM's own order.placed subscriber
 * (orderCount/lifetimeValue on Contact, crm.prisma's own doc comment): the
 * module that owns Contact is the one that writes to it, never a foreign
 * module reaching in directly.
 */
@Injectable()
export class RtoContactListener {
  private readonly logger = new Logger(RtoContactListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnDomainEvent(DomainEvent.ShipmentReturnedToOrigin)
  async onShipmentReturnedToOrigin(payload: ShipmentReturnedToOriginPayload): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: { contactId: true },
    });
    if (!order?.contactId) return;

    await this.prisma.contact.update({
      where: { id: order.contactId },
      data: { rtoCount: { increment: 1 } },
    });
  }
}
