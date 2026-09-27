import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type GoodsReceivedPayload } from '../../core/events/domain-events';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SupplierResilienceService } from './supplier-resilience.service';

/**
 * 144-supply-chain-resilience-planning-engine.md (WO-144.6, R25) — backfills
 * `SupplierLeadTimeObservation` from `GoodsReceived`, additive and never
 * requiring new data entry. `observedDays` is the PO's own `sentAt` (or
 * `createdAt` when it was never explicitly sent) to this receipt's own
 * `receivedAt` — the closest this schema has to doc 144's own "order to
 * delivery," since `PurchaseOrder` carries no `placedAt` field.
 */
@Injectable()
export class GoodsReceivedLeadTimeListener {
  private readonly logger = new Logger(GoodsReceivedLeadTimeListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resilience: SupplierResilienceService,
  ) {}

  @OnDomainEvent(DomainEvent.GoodsReceived)
  async onGoodsReceived(payload: GoodsReceivedPayload): Promise<void> {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id: payload.purchaseOrderId },
      select: { sentAt: true, createdAt: true },
    });
    if (!order) {
      this.logger.warn(`GoodsReceived for an unknown purchase order ${payload.purchaseOrderId} — no lead-time observation recorded.`);
      return;
    }

    const placedAt = order.sentAt ?? order.createdAt;
    const receivedAt = new Date(payload.receivedAtIso);
    const observedDays = Math.round((receivedAt.getTime() - placedAt.getTime()) / (24 * 60 * 60 * 1000));

    await this.resilience.recordObservation(payload.supplierId, payload.purchaseOrderId, observedDays);
  }
}
