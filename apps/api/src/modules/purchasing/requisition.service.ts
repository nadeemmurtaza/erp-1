import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ApprovalService } from '../../core/approvals/approval.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { DomainEvent } from '../../core/events/domain-events';
import { PurchasingService } from './purchasing.service';
import { CreateRequisitionDto, ConvertRequisitionDto } from './dto/requisition.dto';
import type { PurchaseRequisition, RequisitionApprovalStatus } from '../../core/prisma/client';

const APPROVER_PERMISSION = 'purchasing.requisitions.approve';

function chainStatusToRequisitionStatus(chainStatus: 'PENDING' | 'APPROVED' | 'REJECTED'): RequisitionApprovalStatus {
  return chainStatus;
}

/**
 * 152-purchase-requisition.md. A requisition is a REQUEST to buy — it can be
 * rejected outright, and even once APPROVED it is not yet a commitment (no
 * supplier, no price) until convertToPurchaseOrder() runs, a separate,
 * explicit action never triggered automatically by approval.
 */
@Injectable()
export class RequisitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
    private readonly purchasing: PurchasingService,
    private readonly events: EventBusService,
  ) {}

  async create(dto: CreateRequisitionDto, requestedById: string): Promise<PurchaseRequisition> {
    if (dto.lines.length === 0) {
      throw new BadRequestException('A requisition needs at least one line.');
    }

    return this.prisma.$transaction(async (tx) => {
      const requisition = await tx.purchaseRequisition.create({
        data: {
          requestedById,
          locationId: dto.locationId,
          justification: dto.justification,
          lines: {
            create: dto.lines.map((line) => ({
              variantId: line.variantId,
              quantity: line.quantity,
              estimatedUnitCostMinor: line.estimatedUnitCostMinor ?? null,
            })),
          },
        },
        include: { lines: true },
      });

      // Single-step chain: any user holding purchasing.requisitions.approve
      // may decide it — who specifically is a route-level PBAC concern
      // (RequisitionController's @RequirePermission), never resolved here.
      await this.approvals.start('PURCHASE_REQUISITION', requisition.id, [{ approverRoleId: APPROVER_PERMISSION }], tx);

      await this.events.publish(
        DomainEvent.RequisitionCreated,
        { requisitionId: requisition.id, requestedById, locationId: dto.locationId },
        tx,
      );

      return requisition;
    });
  }

  async findMany(filters: { status?: RequisitionApprovalStatus; requestedById?: string } = {}) {
    return this.prisma.purchaseRequisition.findMany({
      where: {
        status: filters.status,
        requestedById: filters.requestedById,
      },
      include: { lines: { include: { variant: { select: { id: true, sku: true, label: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const requisition = await this.prisma.purchaseRequisition.findUnique({
      where: { id },
      include: {
        lines: { include: { variant: { select: { id: true, sku: true, label: true } } } },
        convertedPurchaseOrder: { select: { id: true, number: true, status: true } },
      },
    });
    if (!requisition) throw new NotFoundException('Requisition not found.');
    return requisition;
  }

  /**
   * The requester of a PurchaseRequisition is never its own approver — the
   * identical self-approval refusal this repository already applies
   * elsewhere (doc 63, doc 145, doc 149).
   */
  async approve(requisitionId: string, actorId: string, comment?: string): Promise<PurchaseRequisition> {
    return this.decide(requisitionId, actorId, 'APPROVE', comment);
  }

  async reject(requisitionId: string, actorId: string, comment?: string): Promise<PurchaseRequisition> {
    return this.decide(requisitionId, actorId, 'REJECT', comment);
  }

  private async decide(
    requisitionId: string,
    actorId: string,
    decision: 'APPROVE' | 'REJECT',
    comment?: string,
  ): Promise<PurchaseRequisition> {
    return this.prisma.$transaction(async (tx) => {
      const requisition = await tx.purchaseRequisition.findUnique({ where: { id: requisitionId } });
      if (!requisition) throw new NotFoundException('Requisition not found.');
      if (requisition.requestedById === actorId) {
        throw new ForbiddenException('The requester of a requisition cannot approve or reject their own request.');
      }
      if (requisition.status !== 'PENDING') {
        throw new ConflictException(`This requisition is already ${requisition.status}.`);
      }

      const chain = await this.approvals.getChain('PURCHASE_REQUISITION', requisitionId, tx);
      if (!chain) throw new NotFoundException('No approval chain found for this requisition.');
      const step = chain.steps.find((s) => s.status === 'PENDING');
      if (!step) throw new ConflictException('No pending approval step on this requisition.');

      const decided = await this.approvals.decide(chain.id, step.id, decision, actorId, comment, tx);

      return tx.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
          status: chainStatusToRequisitionStatus(decided.status as 'PENDING' | 'APPROVED' | 'REJECTED'),
          rejectionNote: decision === 'REJECT' ? (comment?.trim() || null) : undefined,
        },
      });
    });
  }

  /**
   * Creates an ordinary PurchaseOrder through the existing purchasing path —
   * never a bypass of PurchaseOrder's own creation rules — and claims the
   * requisition atomically in the SAME transaction, so a requisition
   * converted concurrently can never produce two POs (the "second copy of
   * the write" lens): if the claim loses the race, the whole transaction,
   * including the just-created PO, rolls back.
   */
  async convertToPurchaseOrder(requisitionId: string, dto: ConvertRequisitionDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const requisition = await tx.purchaseRequisition.findUnique({
        where: { id: requisitionId },
        include: { lines: true },
      });
      if (!requisition) throw new NotFoundException('Requisition not found.');
      if (requisition.status === 'CONVERTED') {
        throw new ConflictException('This requisition has already been converted to a purchase order.');
      }
      if (requisition.status !== 'APPROVED') {
        throw new BadRequestException('Only an approved requisition can be converted to a purchase order.');
      }

      const supplierProducts = await tx.supplierProduct.findMany({
        where: { supplierId: dto.supplierId, variantId: { in: requisition.lines.map((l) => l.variantId) } },
      });
      const lastCostByVariant = new Map(supplierProducts.map((sp) => [sp.variantId, sp.lastCost]));

      const items = requisition.lines.map((line) => {
        const unitCost =
          dto.priceOverrides?.[line.variantId] ??
          line.estimatedUnitCostMinor ??
          lastCostByVariant.get(line.variantId) ??
          0;
        return { variantId: line.variantId, quantityOrdered: line.quantity, unitCost, note: undefined };
      });

      const po = await this.purchasing.createPurchaseOrder(
        {
          supplierId: dto.supplierId,
          items,
          notes: `Converted from requisition ${requisition.id} — ${requisition.justification}`,
        },
        actorId,
        tx,
      );

      const claimed = await tx.purchaseRequisition.updateMany({
        where: { id: requisitionId, status: 'APPROVED' },
        data: { status: 'CONVERTED', convertedPurchaseOrderId: po.id },
      });
      if (claimed.count === 0) {
        throw new ConflictException('This requisition was converted concurrently — no second purchase order was created.');
      }

      await this.events.publish(
        DomainEvent.RequisitionConverted,
        { requisitionId, purchaseOrderId: po.id, supplierId: dto.supplierId },
        tx,
      );

      return po;
    });
  }
}
