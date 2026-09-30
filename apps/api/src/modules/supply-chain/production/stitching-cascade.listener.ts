import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import { DomainEvent, type StitchingJobPayload } from '../../../core/events/domain-events';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { WorkOrdersService } from './work-orders.service';

/**
 * Closes the order-cascade requirement for stitching WITHOUT production ever
 * importing or querying the stitching module: it reacts only to the two
 * events StitchingJobsService already publishes, carrying everything needed
 * (variantId, quantity, jobId) in their payload. Core reacting to a pack's
 * event is fine — the direction rule only forbids core importing a pack's
 * module/service/schema, and this listener does neither. Mirrors exactly how
 * stitching's own StitchingOrderSubscriber reacts to orders' OrderPlaced.
 *
 * Most stitched order lines are pure made-to-order (no finished-goods
 * variant, no BOM) and this listener is a silent no-op for every one of
 * them — it only matters for a ready-to-wear variant that both
 * producedInHouse and has a BillOfMaterial configured.
 */
@Injectable()
export class StitchingCascadeListener {
  private readonly logger = new Logger(StitchingCascadeListener.name);

  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly prisma: PrismaService,
  ) {}

  @OnDomainEvent(DomainEvent.StitchingJobCreated)
  async onStitchingJobCreated(payload: StitchingJobPayload): Promise<void> {
    if (!payload.variantId) return;

    // Idempotent against a redelivered event: a WorkOrder already linked to
    // this job means a previous delivery already did this.
    const existingLink = await this.prisma.workOrder.findFirst({
      where: { sourceRefType: 'StitchingJob', sourceRefId: payload.jobId },
    });
    if (existingLink) return;

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: payload.variantId },
      select: { producedInHouse: true, sku: true },
    });
    if (!variant?.producedInHouse) return;

    const bom = await this.prisma.billOfMaterial.findUnique({ where: { variantId: payload.variantId } });
    if (!bom) {
      this.logger.warn(
        `${variant.sku} is producedInHouse but has no bill of materials — cannot open a WorkOrder for StitchingJob ${payload.jobId}.`,
      );
      return;
    }

    // Garment production consumes materials right away, unlike a batch
    // reorder that stays DRAFT until staff act on it.
    const workOrder = await this.workOrders.create({
      variantId: payload.variantId,
      quantityOrdered: payload.quantity ?? 1,
      source: 'ORDER_CASCADE',
      sourceRefType: 'StitchingJob',
      sourceRefId: payload.jobId,
    });
    await this.workOrders.release(workOrder.id);
    this.logger.log(`Opened and released WorkOrder ${workOrder.number} for StitchingJob ${payload.jobId}`);
  }

  @OnDomainEvent(DomainEvent.StitchingJobStageChanged)
  async onStitchingJobStageChanged(payload: StitchingJobPayload): Promise<void> {
    if (payload.toStage !== 'READY') return;

    const workOrder = await this.prisma.workOrder.findFirst({
      where: { sourceRefType: 'StitchingJob', sourceRefId: payload.jobId, status: 'RELEASED' },
    });
    if (!workOrder) return;

    await this.workOrders.complete(workOrder.id, workOrder.quantityOrdered - workOrder.quantityCompleted);
    this.logger.log(`Completed WorkOrder ${workOrder.number} — StitchingJob ${payload.jobId} reached READY`);
  }
}
