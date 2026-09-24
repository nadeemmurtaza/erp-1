import { Injectable, Logger } from '@nestjs/common';
import {
  DomainEvent,
  type ReturnRequestFullyRefundedPayload,
  type ShipmentStatusChangedPayload,
} from '../../core/events/domain-events';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import type { OrderStatus } from '../../core/prisma/client';
import { OrdersService } from './orders.service';

const SHIPMENT_TO_ORDER_STATUS: Partial<Record<string, OrderStatus>> = {
  DISPATCHED: 'SHIPPED',
  IN_TRANSIT: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  RETURNED: 'RETURNED',
  // LOST has no Order.status equivalent — it surfaces on the fulfilment
  // admin screen instead, and staff decides what happens to the order.
};

/**
 * The ONLY place a fulfilment-module event ever reaches Order.status.
 * Lives in `orders` on purpose (INDEPENDENCE, MULTI-SECTOR.md): fulfilment
 * never imports OrdersService, it only publishes events onto the shared
 * bus, so calling changeStatus() here is a same-module call, not a new
 * cross-module coupling.
 */
@Injectable()
export class ShipmentStatusListener {
  private readonly logger = new Logger(ShipmentStatusListener.name);

  constructor(private readonly orders: OrdersService) {}

  @OnDomainEvent(DomainEvent.ShipmentStatusChanged)
  async onShipmentStatusChanged(payload: ShipmentStatusChangedPayload): Promise<void> {
    const toStatus = SHIPMENT_TO_ORDER_STATUS[payload.toStatus];
    if (!toStatus) return;

    try {
      await this.orders.changeStatus(
        null,
        payload.orderId,
        toStatus,
        payload.isRto ? 'Return to origin' : undefined,
      );
    } catch (error) {
      this.logger.warn(
        `Could not advance order ${payload.orderNumber} to ${toStatus}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * WO-6.6's own full-order REFUND path — returns.service.ts#inspect() has
   * already moved every returned item's stock (RETURN or WRITE_OFF, per
   * item), so this is the one call site that passes skipStockRelease: true
   * — changeStatus's own default restock-everything-with-RETURN would
   * otherwise double-move stock already handled by the return's inspection.
   */
  @OnDomainEvent(DomainEvent.ReturnRequestFullyRefunded)
  async onReturnFullyRefunded(payload: ReturnRequestFullyRefundedPayload): Promise<void> {
    try {
      await this.orders.changeStatus(
        payload.actorId,
        payload.orderId,
        'RETURNED',
        `Return ${payload.returnNumber}`,
        { skipStockRelease: true },
      );
    } catch (error) {
      this.logger.warn(
        `Could not mark order ${payload.orderNumber} returned for ${payload.returnNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
