import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { DomainEvent } from '../../core/events/domain-events';
import { Prisma, WorkOrderSource, WorkOrderStatus } from '../../core/prisma/client';
import { CreateWorkOrderDto } from './dto/work-order.dto';

/**
 * WO-2026-0001, sequential within the year — same atomic-counter pattern as
 * nextJobNumber() (stitching/jobs.service.ts) and nextPONumber()
 * (purchasing/purchasing.service.ts): a single INSERT ... ON CONFLICT ...
 * RETURNING, never a MAX(WorkOrder.number) read.
 */
async function nextWorkOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;
  const [{ counter }] = await tx.$queryRaw<Array<{ counter: number }>>`
    INSERT INTO "WorkOrderNumberCounter" ("year", "counter") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "counter" = "WorkOrderNumberCounter"."counter" + 1
    RETURNING "counter"
  `;
  return `${prefix}${String(counter).padStart(4, '0')}`;
}

const workOrderInclude = {
  variant: { select: { id: true, sku: true, label: true } },
} satisfies Prisma.WorkOrderInclude;

export interface CreateWorkOrderInput {
  variantId: string;
  quantityOrdered: number;
  source: WorkOrderSource;
  sourceRefType?: string;
  sourceRefId?: string;
  locationId?: string;
  notes?: string;
  createdById?: string;
}

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly events: EventBusService,
  ) {}

  async list(status?: WorkOrderStatus) {
    return this.prisma.workOrder.findMany({
      where: status ? { status } : undefined,
      include: workOrderInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id }, include: workOrderInclude });
    if (!workOrder) throw new NotFoundException('That work order no longer exists.');
    return workOrder;
  }

  async createFromDto(dto: CreateWorkOrderDto, userId: string) {
    return this.create({
      variantId: dto.variantId,
      quantityOrdered: dto.quantityOrdered,
      source: 'MANUAL',
      locationId: dto.locationId,
      notes: dto.notes,
      createdById: userId,
    });
  }

  /**
   * Opens a DRAFT WorkOrder. A producedInHouse variant with no BillOfMaterial
   * is a data problem, not a silent no-op — the caller (staff, or the
   * reorder listener) needs to know a recipe is missing rather than getting
   * back an empty work order nobody can ever release.
   */
  async create(input: CreateWorkOrderInput) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: input.variantId } });
    if (!variant) throw new NotFoundException('That variant no longer exists.');
    if (!variant.producedInHouse) {
      throw new BadRequestException('That variant is not marked producedInHouse.');
    }

    const bom = await this.prisma.billOfMaterial.findUnique({ where: { variantId: input.variantId } });
    if (!bom) {
      throw new BadRequestException(
        `${variant.sku} is producedInHouse but has no bill of materials configured — add one before opening a work order.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const number = await nextWorkOrderNumber(tx);
      const workOrder = await tx.workOrder.create({
        data: {
          number,
          variantId: input.variantId,
          quantityOrdered: input.quantityOrdered,
          source: input.source,
          sourceRefType: input.sourceRefType,
          sourceRefId: input.sourceRefId,
          locationId: input.locationId,
          notes: input.notes,
          createdById: input.createdById,
        },
        include: workOrderInclude,
      });

      await this.events.publish(
        DomainEvent.WorkOrderCreated,
        { workOrderId: workOrder.id, number: workOrder.number, variantId: workOrder.variantId, status: workOrder.status, source: workOrder.source },
        tx,
      );

      return workOrder;
    });
  }

  /** Tops up an existing open (DRAFT/RELEASED) work order for a variant rather than creating a duplicate. */
  async findOpenForVariant(variantId: string, source: WorkOrderSource) {
    return this.prisma.workOrder.findFirst({
      where: { variantId, source, status: { in: ['DRAFT', 'RELEASED'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async topUpQuantity(id: string, quantityOrdered: number) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!workOrder) throw new NotFoundException('That work order no longer exists.');
    if (quantityOrdered <= workOrder.quantityOrdered) return workOrder;
    return this.prisma.workOrder.update({ where: { id }, data: { quantityOrdered } });
  }

  /**
   * Consumes each BOM component's stock. This is the write that must commit
   * in the same transaction as the WorkOrder's own status change —
   * production -> inventory in KNOWN_MODULE_COUPLINGS.
   */
  async release(id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!workOrder) throw new NotFoundException('That work order no longer exists.');
    if (workOrder.status !== 'DRAFT') {
      throw new BadRequestException(`WorkOrder must be DRAFT to release; it is ${workOrder.status}.`);
    }

    const bom = await this.prisma.billOfMaterial.findUnique({
      where: { variantId: workOrder.variantId },
      include: { components: true },
    });
    if (!bom || bom.components.length === 0) {
      throw new BadRequestException('That variant has no bill of materials to consume.');
    }

    return this.prisma.$transaction(async (tx) => {
      const locationId = workOrder.locationId ?? (await this.inventory.defaultLocationId(tx));

      await this.inventory.moveMany(
        bom.components.map((line) => ({
          variantId: line.componentVariantId,
          locationId,
          delta: -Math.ceil(line.quantityPerUnit * workOrder.quantityOrdered),
          reason: 'PRODUCTION_CONSUMPTION' as const,
          refType: 'WorkOrder',
          refId: workOrder.id,
        })),
        tx,
      );

      const updated = await tx.workOrder.update({
        where: { id },
        data: { status: 'RELEASED', releasedAt: new Date(), locationId },
        include: workOrderInclude,
      });

      await this.events.publish(
        DomainEvent.WorkOrderReleased,
        { workOrderId: updated.id, number: updated.number, variantId: updated.variantId, status: updated.status, source: updated.source },
        tx,
      );

      return updated;
    });
  }

  /** Credits the produced variant's stock. Also the coupling's other half. */
  async complete(id: string, quantityCompleted: number) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!workOrder) throw new NotFoundException('That work order no longer exists.');
    if (workOrder.status !== 'RELEASED') {
      throw new BadRequestException(`WorkOrder must be RELEASED to complete; it is ${workOrder.status}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const locationId = workOrder.locationId ?? (await this.inventory.defaultLocationId(tx));

      await this.inventory.move(
        {
          variantId: workOrder.variantId,
          locationId,
          delta: quantityCompleted,
          reason: 'PRODUCTION_RECEIPT',
          refType: 'WorkOrder',
          refId: workOrder.id,
        },
        tx,
      );

      const updated = await tx.workOrder.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          quantityCompleted: { increment: quantityCompleted },
        },
        include: workOrderInclude,
      });

      await this.events.publish(
        DomainEvent.WorkOrderCompleted,
        { workOrderId: updated.id, number: updated.number, variantId: updated.variantId, status: updated.status, source: updated.source },
        tx,
      );

      return updated;
    });
  }

  /** Reverses any RELEASED consumption, symmetric with how orders.service.ts returns stock on cancellation. */
  async cancel(id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!workOrder) throw new NotFoundException('That work order no longer exists.');
    if (workOrder.status === 'COMPLETED' || workOrder.status === 'CANCELLED') {
      throw new BadRequestException(`WorkOrder is already ${workOrder.status}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (workOrder.status === 'RELEASED' && workOrder.locationId) {
        const bom = await tx.billOfMaterial.findUnique({
          where: { variantId: workOrder.variantId },
          include: { components: true },
        });
        if (bom) {
          await this.inventory.moveMany(
            bom.components.map((line) => ({
              variantId: line.componentVariantId,
              locationId: workOrder.locationId!,
              delta: Math.ceil(line.quantityPerUnit * workOrder.quantityOrdered),
              reason: 'ADJUSTMENT' as const,
              refType: 'WorkOrder',
              refId: workOrder.id,
              note: 'Reversed on WorkOrder cancellation',
            })),
            tx,
          );
        }
      }

      return tx.workOrder.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
        include: workOrderInclude,
      });
    });
  }
}
