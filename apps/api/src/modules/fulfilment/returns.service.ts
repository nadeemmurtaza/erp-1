import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../../core/config/app-config.service';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { documentNumber } from '../../core/settings/document-number';
import { documentPrefix } from '../../core/settings/document-prefix';
import { SettingsService } from '../../core/settings/settings.service';
import { InventoryService } from '../inventory/inventory.service';
import type { Prisma, ReturnStatus } from '../../core/prisma/client';
import type {
  CreateReturnReasonDto,
  CreateReturnRequestDto,
  DecideReturnRequestDto,
  InspectReturnRequestDto,
  ResolveReturnRequestDto,
} from './dto/returns.dto';

const requestInclude = {
  items: { include: { reason: true, orderItem: true } },
  order: { select: { id: true, number: true, userId: true, locationId: true, status: true, items: true } },
} satisfies Prisma.ReturnRequestInclude;

async function nextReturnRequestNumber(
  prisma: PrismaService,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = await documentPrefix(settings, 'returnRequest');
  const [{ counter }] = await prisma.$queryRaw<Array<{ counter: number }>>`
    INSERT INTO "ReturnRequestNumberCounter" ("year", "counter") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "counter" = "ReturnRequestNumberCounter"."counter" + 1
    RETURNING "counter"
  `;
  return documentNumber(config, prefix, year, counter);
}

/**
 * WO-6.6 — request -> approve/reject -> receive -> inspect -> resolve.
 * Reason codes are a seeded, editable list (never free text): they are the
 * fit-feedback input for Phase 9's own work, not this one's.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly inventory: InventoryService,
  ) {}

  listReasons() {
    return this.prisma.returnReasonCode.findMany({
      where: { isActive: true },
      include: { translations: true },
      orderBy: { order: 'asc' },
    });
  }

  createReason(dto: CreateReturnReasonDto) {
    return this.prisma.returnReasonCode.create({
      data: { key: dto.key, order: dto.order ?? 0, translations: { create: dto.translations } },
      include: { translations: true },
    });
  }

  listRequests(filter?: { status?: ReturnStatus }) {
    return this.prisma.returnRequest.findMany({
      where: { status: filter?.status },
      include: requestInclude,
      orderBy: { requestedAt: 'desc' },
    });
  }

  listForUser(userId: string) {
    return this.prisma.returnRequest.findMany({
      where: { userId },
      include: requestInclude,
      orderBy: { requestedAt: 'desc' },
    });
  }

  async getRequest(id: string, userId?: string) {
    const request = await this.prisma.returnRequest.findUnique({ where: { id }, include: requestInclude });
    if (!request || (userId && request.userId !== userId)) {
      throw new NotFoundException('That return request no longer exists.');
    }
    return request;
  }

  async createRequest(dto: CreateReturnRequestDto, userId: string | null) {
    const order = await this.prisma.order.findUnique({ where: { number: dto.orderNumber }, include: { items: true } });
    if (!order || (userId && order.userId !== userId)) {
      throw new NotFoundException('That order no longer exists.');
    }
    if (order.status !== 'DELIVERED') {
      throw new BadRequestException('Only a delivered order can be returned.');
    }

    const activeClaims = await this.prisma.returnRequestItem.findMany({
      where: {
        orderItemId: { in: dto.items.map((line) => line.orderItemId) },
        returnRequest: { status: { not: 'REJECTED' } },
      },
      select: { orderItemId: true, quantity: true },
    });
    const claimed = new Map<string, number>();
    for (const row of activeClaims) {
      claimed.set(row.orderItemId, (claimed.get(row.orderItemId) ?? 0) + row.quantity);
    }

    for (const line of dto.items) {
      const orderItem = order.items.find((item) => item.id === line.orderItemId);
      if (!orderItem) throw new BadRequestException(`Order item ${line.orderItemId} is not on this order.`);
      const already = claimed.get(line.orderItemId) ?? 0;
      if (already + line.quantity > orderItem.quantity) {
        throw new BadRequestException(
          `Only ${Math.max(0, orderItem.quantity - already)} unit(s) of "${orderItem.nameEn}" can still be returned.`,
        );
      }
    }

    const number = await nextReturnRequestNumber(this.prisma, this.settings, this.config);
    const request = await this.prisma.returnRequest.create({
      data: {
        number,
        orderId: order.id,
        userId: userId ?? order.userId,
        customerNote: dto.customerNote,
        items: {
          create: dto.items.map((line) => ({
            orderItemId: line.orderItemId,
            reasonId: line.reasonId,
            quantity: line.quantity,
          })),
        },
      },
      include: requestInclude,
    });

    await this.events.publish(DomainEvent.ReturnRequestStatusChanged, {
      returnId: request.id,
      returnNumber: request.number,
      orderId: order.id,
      fromStatus: null,
      toStatus: 'REQUESTED',
      actorId: userId,
    });

    await this.audit.record({
      actorId: userId,
      action: 'fulfilment.return_requested',
      entity: 'ReturnRequest',
      entityId: request.id,
      data: { orderId: order.id, itemCount: dto.items.length },
    });

    return request;
  }

  async attachPhoto(id: string, url: string, existingUrls: string[]) {
    return this.prisma.returnRequest.update({
      where: { id },
      data: { photoUrls: [...existingUrls, url] },
      include: requestInclude,
    });
  }

  private async transition(
    id: string,
    allowedFrom: ReturnStatus[],
    toStatus: ReturnStatus,
    data: Prisma.ReturnRequestUpdateInput,
    actorId: string,
  ) {
    const request = await this.prisma.returnRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('That return request no longer exists.');
    if (!allowedFrom.includes(request.status)) {
      throw new BadRequestException(
        `A return that is ${request.status.toLowerCase()} cannot become ${toStatus.toLowerCase()}.`,
      );
    }

    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: { status: toStatus, ...data },
      include: requestInclude,
    });

    await this.events.publish(DomainEvent.ReturnRequestStatusChanged, {
      returnId: id,
      returnNumber: request.number,
      orderId: request.orderId,
      fromStatus: request.status,
      toStatus,
      actorId,
    });

    await this.audit.record({
      actorId,
      action: 'fulfilment.return_status_changed',
      entity: 'ReturnRequest',
      entityId: id,
      data: { from: request.status, to: toStatus },
    });

    return updated;
  }

  approve(id: string, actorId: string, dto: DecideReturnRequestDto) {
    return this.transition(id, ['REQUESTED'], 'APPROVED', { approvedAt: new Date(), staffNote: dto.note }, actorId);
  }

  reject(id: string, actorId: string, dto: DecideReturnRequestDto) {
    return this.transition(id, ['REQUESTED', 'APPROVED'], 'REJECTED', { staffNote: dto.note }, actorId);
  }

  markInTransit(id: string, actorId: string) {
    return this.transition(id, ['APPROVED'], 'IN_TRANSIT', {}, actorId);
  }

  markReceived(id: string, actorId: string) {
    return this.transition(id, ['APPROVED', 'IN_TRANSIT'], 'RECEIVED', { receivedAt: new Date() }, actorId);
  }

  /**
   * The inventory decision WO-6.6 requires: restockable -> `RETURN` (back on
   * the shelf), not restockable -> `WRITE_OFF` (a direct cost, never silent
   * shrinkage) — both in the same transaction as the ReturnRequestItem write
   * (fulfilment -> inventory, KNOWN_MODULE_COUPLINGS).
   */
  async inspect(id: string, dto: InspectReturnRequestDto, actorId: string) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: { items: { include: { orderItem: true } }, order: { select: { locationId: true } } },
    });
    if (!request) throw new NotFoundException('That return request no longer exists.');
    if (request.status !== 'RECEIVED') {
      throw new BadRequestException(
        `A return that is ${request.status.toLowerCase()} cannot be inspected — mark it received first.`,
      );
    }

    const byId = new Map(request.items.map((item) => [item.id, item]));
    for (const line of dto.items) {
      if (!byId.has(line.itemId)) throw new BadRequestException(`"${line.itemId}" is not on this return.`);
    }

    const locationId = request.order.locationId ?? (await this.inventory.defaultLocationId());

    await this.prisma.$transaction(async (tx) => {
      for (const line of dto.items) {
        const item = byId.get(line.itemId)!;
        if (item.orderItem.variantId) {
          await this.inventory.move(
            {
              variantId: item.orderItem.variantId,
              locationId,
              delta: item.quantity,
              reason: line.restockable ? 'RETURN' : 'WRITE_OFF',
              refType: 'ReturnRequest',
              refId: request.id,
              actorId,
            },
            tx,
          );
        }
        await tx.returnRequestItem.update({
          where: { id: line.itemId },
          data: { restockable: line.restockable, restocked: true },
        });
      }

      await tx.returnRequest.update({
        where: { id },
        data: { status: 'INSPECTED', inspectedAt: new Date(), staffNote: dto.staffNote },
      });

      await this.events.publish(
        DomainEvent.ReturnRequestStatusChanged,
        {
          returnId: id,
          returnNumber: request.number,
          orderId: request.orderId,
          fromStatus: 'RECEIVED',
          toStatus: 'INSPECTED',
          actorId,
        },
        tx,
      );
    });

    await this.audit.record({
      actorId,
      action: 'fulfilment.return_inspected',
      entity: 'ReturnRequest',
      entityId: id,
      data: { items: dto.items },
    });

    return this.getRequest(id);
  }

  /**
   * REFUND is only permitted when this return covers the order's entire
   * returnable quantity. Why: accounting/posting-rules.subscriber.ts's own
   * onPaymentRefunded() has no partial-refund support today — its own doc
   * comment says a full reversal "is the correct read of today's domain
   * model, not an approximation of one that isn't built". Wiring a partial
   * return's refund through PaymentsService.refund() would silently reverse
   * the WHOLE order's revenue and COGS for one returned item among several
   * — a worse defect than refusing the combination outright. A partial
   * return resolves as EXCHANGE/STORE_CREDIT/REPAIR/REJECTED instead, until
   * that ledger gap is closed as its own work order — fixing money-critical
   * posting logic as a side effect of this one would be exactly the "quick
   * fix stacked on a quick fix" CLAUDE.md forbids. STORE_CREDIT itself is
   * recorded here as a resolution only — real issuance/redemption depends
   * on Phase 5 (05-promotions-giftcards.md), unbuilt.
   *
   * On a full-order REFUND this fires ReturnRequestFullyRefunded, the only
   * event that makes orders/shipment-status.listener.ts call
   * changeStatus(..., {skipStockRelease: true}) — inspect() already moved
   * every item's stock, so changeStatus must not restock a second time. The
   * actual payment reversal is sequenced by the admin client calling the
   * existing PaymentsService.refund() endpoint first, then this one — the
   * same client-side composition pos.module.ts documents for POS returns,
   * no new payments coupling either.
   */
  async resolve(id: string, dto: ResolveReturnRequestDto, actorId: string) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: { items: true, order: { select: { id: true, number: true, items: true } } },
    });
    if (!request) throw new NotFoundException('That return request no longer exists.');
    if (request.status !== 'INSPECTED') {
      throw new BadRequestException(
        `A return that is ${request.status.toLowerCase()} cannot be resolved — inspect it first.`,
      );
    }

    if (dto.resolution === 'REFUND') {
      const returnedQuantity = request.items.reduce((sum, item) => sum + item.quantity, 0);
      const orderQuantity = request.order.items.reduce((sum, item) => sum + item.quantity, 0);
      if (returnedQuantity < orderQuantity) {
        throw new BadRequestException(
          'A partial return cannot be refunded to the original payment method yet — resolve it as store credit, exchange or repair, or close it and process the refund manually.',
        );
      }
    }

    const toStatus = dto.resolution === 'REFUND' ? 'REFUNDED' : 'CLOSED';
    const updated = await this.transition(
      id,
      ['INSPECTED'],
      toStatus,
      {
        resolution: dto.resolution,
        refundAmount: dto.refundAmount,
        refundedAt: dto.resolution === 'REFUND' ? new Date() : undefined,
        staffNote: dto.staffNote,
      },
      actorId,
    );

    if (dto.resolution === 'REFUND') {
      await this.events.publish(DomainEvent.ReturnRequestFullyRefunded, {
        returnId: id,
        returnNumber: request.number,
        orderId: request.orderId,
        orderNumber: request.order.number,
        actorId,
      });
    }

    return updated;
  }
}
