import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type ProductReorderPointReachedPayload } from '../../core/events/domain-events';
import { WorkOrdersService } from './work-orders.service';

/**
 * The in-house mirror of purchasing's reorder.listener.ts: a real-time
 * reorder-point crossing on a producedInHouse variant opens (or tops up) a
 * DRAFT WorkOrder instead of a PO. Never fires for the same variant as
 * purchasing's listener — the two are mutually exclusive on
 * payload.producedInHouse.
 */
@Injectable()
export class ReorderWorkOrderListener {
  private readonly logger = new Logger(ReorderWorkOrderListener.name);

  constructor(private readonly workOrders: WorkOrdersService) {}

  @OnDomainEvent(DomainEvent.ProductReorderPointReached)
  async onReorderPointReached(payload: ProductReorderPointReachedPayload): Promise<void> {
    if (!payload.producedInHouse) return;

    let quantity = payload.reorderQuantity ?? payload.reorderPoint - payload.stock;
    if (quantity < 1) quantity = 1;

    const existing = await this.workOrders.findOpenForVariant(payload.variantId, 'REORDER');
    if (existing) {
      await this.workOrders.topUpQuantity(existing.id, quantity);
      this.logger.log(`Real-time reorder: topped up WorkOrder ${existing.number} for ${payload.sku} to qty ${quantity}`);
      return;
    }

    try {
      const workOrder = await this.workOrders.create({
        variantId: payload.variantId,
        quantityOrdered: quantity,
        source: 'REORDER',
      });
      this.logger.log(`Real-time reorder: opened WorkOrder ${workOrder.number} for ${payload.sku} (qty ${quantity})`);
    } catch (error) {
      // Missing BOM is a data-setup problem, not a transient failure —
      // retrying (the outbox's default on a thrown error) can never fix it.
      // Log loudly instead so it surfaces the same way a bounced email would,
      // and let the event be marked delivered.
      if (error instanceof BadRequestException) {
        this.logger.error(`Cannot auto-open a WorkOrder for ${payload.sku}: ${error.message}`);
        return;
      }
      throw error;
    }
  }
}
