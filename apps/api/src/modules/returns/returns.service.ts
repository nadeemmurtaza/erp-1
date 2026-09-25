import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import type { ReturnRequest } from '../../core/prisma/client';
import type { CreateReturnRequestDto, DecideReturnRequestDto, ReturnRequestQueryDto } from './dto/return-request.dto';

const returnInclude = {
  lines: { include: { orderItem: true } },
  order: { select: { number: true, status: true, deliveredAt: true } },
  user: { select: { email: true, phone: true, firstName: true } },
} as const;

/**
 * WO-7.3 (docs/implementation/customer-portal-loyalty/07-customer-portal.md),
 * scoped narrow — see returns.prisma's own top-of-file note. This is the
 * customer request + staff decision, never the courier/refund/restock
 * automation Phase 6 (unbuilt) owns.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** The customer knows their order by NUMBER, never the internal id — every returns endpoint takes that. */
  private async findOwnedOrder(orderNumber: string, userId: string) {
    return this.prisma.order.findFirst({ where: { number: orderNumber, userId } });
  }

  async checkEligibility(orderNumber: string, userId: string): Promise<{ eligible: boolean; reason?: string }> {
    const order = await this.findOwnedOrder(orderNumber, userId);
    if (!order) return { eligible: false, reason: 'Order not found.' };
    if (order.status !== 'DELIVERED' || !order.deliveredAt) {
      return { eligible: false, reason: 'Only a delivered order may be returned.' };
    }
    const windowDays = await this.settings.get<number>(SettingKey.ReturnsWindowDays);
    const deadline = new Date(order.deliveredAt.getTime() + windowDays * 24 * 60 * 60 * 1000);
    if (new Date() > deadline) {
      return { eligible: false, reason: `The ${windowDays}-day return window for this order has passed.` };
    }
    return { eligible: true };
  }

  async create(userId: string, dto: CreateReturnRequestDto): Promise<ReturnRequest> {
    const order = await this.findOwnedOrder(dto.orderNumber, userId);
    if (!order) throw new NotFoundException('Order not found.');
    const eligibility = await this.checkEligibility(dto.orderNumber, userId);
    if (!eligibility.eligible) throw new ForbiddenException(eligibility.reason);

    const orderItems = await this.prisma.orderItem.findMany({
      where: { id: { in: dto.lines.map((l) => l.orderItemId) }, orderId: order.id },
      include: { returnRequestLines: { include: { returnRequest: true } } },
    });
    const byId = new Map(orderItems.map((item) => [item.id, item]));

    for (const line of dto.lines) {
      const item = byId.get(line.orderItemId);
      if (!item) throw new BadRequestException(`Order line ${line.orderItemId} does not belong to this order.`);
      if (line.quantity > item.quantity) {
        throw new BadRequestException(`Cannot return more than the ${item.quantity} purchased for ${item.nameEn}.`);
      }
      const alreadyRequested = item.returnRequestLines
        .filter((rl) => rl.returnRequest.status !== 'REJECTED')
        .reduce((sum, rl) => sum + rl.quantity, 0);
      if (alreadyRequested + line.quantity > item.quantity) {
        throw new BadRequestException(`${item.nameEn} already has a return request pending or approved for this quantity.`);
      }
    }

    return this.prisma.returnRequest.create({
      data: {
        orderId: order.id,
        userId,
        reasonCode: dto.reasonCode,
        note: dto.note,
        photoUrls: dto.photoUrls ?? [],
        lines: { create: dto.lines.map((l) => ({ orderItemId: l.orderItemId, quantity: l.quantity })) },
      },
      include: returnInclude,
    });
  }

  async myReturns(userId: string): Promise<ReturnRequest[]> {
    return this.prisma.returnRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: returnInclude,
    });
  }

  async getMine(userId: string, id: string): Promise<ReturnRequest> {
    const request = await this.prisma.returnRequest.findFirst({ where: { id, userId }, include: returnInclude });
    if (!request) throw new NotFoundException('Return request not found.');
    return request;
  }

  async listForStaff(query: ReturnRequestQueryDto): Promise<PaginatedResult<ReturnRequest>> {
    const where = query.status ? { status: query.status } : {};
    const [data, total] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        orderBy: { createdAt: query.order },
        skip: query.skip,
        take: query.take,
        include: returnInclude,
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  /**
   * A decision, not a refund. Approving does not move money or stock on its
   * own — staff finish the refund through the existing
   * `PaymentsService.refund()` and restock through
   * `InventoryService.move()` exactly as they would for any other manual
   * correction, then call `markRefunded()` below so the customer sees this
   * request close out honestly rather than sit "approved" forever.
   */
  async decide(id: string, decidedByUserId: string, dto: DecideReturnRequestDto): Promise<ReturnRequest> {
    const request = await this.prisma.returnRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Return request not found.');
    if (request.status !== 'REQUESTED') {
      throw new BadRequestException('This return request has already been decided.');
    }
    return this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: dto.decision,
        decidedAt: new Date(),
        decidedByUserId,
        decisionNote: dto.decisionNote,
      },
      include: returnInclude,
    });
  }

  async markRefunded(id: string): Promise<ReturnRequest> {
    const request = await this.prisma.returnRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Return request not found.');
    if (request.status !== 'APPROVED') {
      throw new BadRequestException('Only an approved return request can be marked refunded.');
    }
    return this.prisma.returnRequest.update({ where: { id }, data: { status: 'REFUNDED' }, include: returnInclude });
  }
}
