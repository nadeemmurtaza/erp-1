import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type StockReplenishedPayload } from '../../core/events/domain-events';
import { PrismaService } from '../../core/prisma/prisma.service';
import { InventoryService, InsufficientStockError } from '../inventory/inventory.service';

/**
 * Closes the backorder loop: whenever ANY stock arrives for a variant — a PO
 * receipt, a completed WorkOrder, a manual adjustment, all fire
 * StockReplenished identically — this looks for order lines still waiting on
 * that variant and allocates the new stock to the oldest one first.
 *
 * Deliberately does not touch Order.status. CONFIRMED/PROCESSING/etc. already
 * track payment and staff-driven fulfillment (see payments.service.ts and
 * OrdersService.changeStatus) — overloading the same status for "stock showed
 * up" would collide with what it already means. A line reaching READY is a
 * customer-visible fact on its own (see OrderItemFulfillmentStatus), without
 * needing to also move the order through its state machine.
 */
@Injectable()
export class BackorderListener {
  private readonly logger = new Logger(BackorderListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  @OnDomainEvent(DomainEvent.StockReplenished)
  async onStockReplenished(payload: StockReplenishedPayload): Promise<void> {
    const waiting = await this.prisma.orderItem.findMany({
      where: { variantId: payload.variantId, fulfillmentStatus: { not: 'READY' } },
      orderBy: { awaitingSince: 'asc' },
    });
    if (waiting.length === 0) return;

    for (const item of waiting) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.inventory.move(
            {
              variantId: payload.variantId,
              locationId: payload.locationId,
              delta: -item.quantity,
              reason: 'SALE',
              refType: 'Order',
              refId: item.orderId,
              unitCost: item.unitCost,
            },
            tx,
          );
          await tx.orderItem.update({
            where: { id: item.id },
            data: { fulfillmentStatus: 'READY', awaitingSince: null },
          });
        });
        this.logger.log(`Allocated replenished stock to order item ${item.id} (variant ${payload.variantId})`);
      } catch (error) {
        if (error instanceof InsufficientStockError) {
          // This replenishment wasn't enough to cover this line — leave it
          // waiting for the next one. Older lines already tried above still
          // got first claim on what arrived.
          continue;
        }
        throw error;
      }
    }
  }
}
