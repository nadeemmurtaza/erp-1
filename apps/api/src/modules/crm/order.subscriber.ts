import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type OrderPlacedPayload } from '../../core/events/domain-events';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CrmService } from './crm.service';

/**
 * Keeps customer records in step with orders.
 *
 * Nothing in the orders module knows the CRM exists — it publishes
 * `order.placed` and this subscribes. That is the whole extensibility argument
 * made concrete: adding this module required no edit to checkout.
 *
 * Outbox delivery is at-least-once, so this must be idempotent. It is:
 * upsertContact matches an existing person rather than creating a second, and
 * the rollups are recomputed from the orders table rather than incremented.
 */
@Injectable()
export class CrmOrderSubscriber {
  private readonly logger = new Logger(CrmOrderSubscriber.name);

  constructor(
    private readonly crm: CrmService,
    private readonly prisma: PrismaService,
  ) {}

  @OnDomainEvent(DomainEvent.OrderPlaced)
  async onOrderPlaced(payload: OrderPlacedPayload): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: { shippingAddress: true },
    });
    const address = order?.shippingAddress as { city?: string } | null;

    const contact = await this.crm.upsertContact({
      name: payload.customerName,
      phone: payload.customerPhone,
      email: payload.customerEmail,
      city: address?.city ?? null,
      userId: payload.userId,
    });

    await this.crm.linkOrder(payload.orderId, contact.id);

    this.logger.log(
      `Order ${payload.orderNumber} attributed to contact ${contact.id} (${contact.phoneE164 ?? 'no phone'})`,
    );
  }

  /**
   * A cancelled or returned order should stop counting toward a customer's
   * value, so the rollups are recomputed whenever an order's status moves.
   */
  @OnDomainEvent(DomainEvent.OrderStatusChanged)
  async onStatusChanged(payload: { orderId: string }): Promise<void> {
    await this.refreshFor(payload.orderId);
  }

  @OnDomainEvent(DomainEvent.OrderCancelled)
  async onCancelled(payload: { orderId: string }): Promise<void> {
    await this.refreshFor(payload.orderId);
  }

  private async refreshFor(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { contactId: true },
    });

    if (order?.contactId) {
      await this.crm.refreshOrderRollups(order.contactId);
    }
  }
}
