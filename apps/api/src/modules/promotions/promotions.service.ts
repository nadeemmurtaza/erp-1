import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { generateHumanCode, evaluateDiscounts, type CartSnapshot, type DiscountRule, type DiscountResult } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService, type PrismaLike } from '../../core/events/event-bus.service';
import { Prisma, type Discount, type PromoCode } from '../../core/prisma/client';
import type { CreateDiscountDto, DiscountQueryDto, PreviewDiscountDto, UpdateDiscountDto } from './dto/discount.dto';
import type { BulkGeneratePromoCodesDto, CreatePromoCodeDto, PromoCodeQueryDto, UpdatePromoCodeDto } from './dto/promo-code.dto';

/** Maps a database Discount row to the pure evaluator's own shape (@newax/shared/discounts.ts). */
function toRule(discount: Discount): DiscountRule {
  return {
    id: discount.id,
    name: discount.name,
    type: discount.type,
    scope: discount.scope,
    value: discount.value,
    maxDiscount: discount.maxDiscount,
    minSubtotal: discount.minSubtotal,
    minQuantity: discount.minQuantity,
    productIds: discount.productIds,
    categoryIds: discount.categoryIds,
    firstOrderOnly: discount.firstOrderOnly,
    buyQuantity: discount.buyQuantity,
    getQuantity: discount.getQuantity,
    getDiscountBps: discount.getDiscountBps,
    isStackable: discount.isStackable,
    priority: discount.priority,
  };
}

export interface CheckoutCartLine {
  id: string;
  productId: string | null;
  categoryIds: string[];
  unitPrice: number;
  quantity: number;
}

export interface CheckoutDiscountResult {
  result: DiscountResult;
  discountsById: Map<string, Discount>;
  promoCode: PromoCode | null;
}

@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
  ) {}

  // ---------------------------------------------------------------------
  // Discount admin CRUD
  // ---------------------------------------------------------------------

  async listDiscounts(query: DiscountQueryDto): Promise<PaginatedResult<Discount & { promoCodeCount: number }>> {
    const where: Prisma.DiscountWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.discount.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: query.order },
        include: { _count: { select: { codes: true } } },
      }),
      this.prisma.discount.count({ where }),
    ]);
    return paginated(
      rows.map(({ _count, ...row }) => ({ ...row, promoCodeCount: _count.codes })),
      total,
      query,
    );
  }

  async getDiscount(id: string): Promise<Discount> {
    const discount = await this.prisma.discount.findUnique({ where: { id } });
    if (!discount) throw new NotFoundException('Discount not found.');
    return discount;
  }

  private validateTypeFields(dto: CreateDiscountDto | UpdateDiscountDto): void {
    if (dto.type === 'BUY_X_GET_Y' && (!dto.buyQuantity || !dto.getQuantity || !dto.getDiscountBps)) {
      throw new BadRequestException('A buy-X-get-Y discount needs buyQuantity, getQuantity and getDiscountBps.');
    }
    if ((dto.type === 'PERCENTAGE' || dto.type === 'FIXED_AMOUNT' || dto.type === 'TIERED') && dto.value === undefined) {
      throw new BadRequestException('This discount type needs a value.');
    }
  }

  async createDiscount(dto: CreateDiscountDto): Promise<Discount> {
    this.validateTypeFields(dto);
    return this.prisma.discount.create({
      data: {
        name: dto.name,
        type: dto.type,
        scope: dto.scope ?? 'ORDER',
        value: dto.value ?? 0,
        maxDiscount: dto.maxDiscount ?? null,
        minSubtotal: dto.minSubtotal ?? null,
        minQuantity: dto.minQuantity ?? null,
        productIds: dto.productIds ?? [],
        categoryIds: dto.categoryIds ?? [],
        customerSegmentId: dto.customerSegmentId ?? null,
        firstOrderOnly: dto.firstOrderOnly ?? false,
        buyQuantity: dto.buyQuantity ?? null,
        getQuantity: dto.getQuantity ?? null,
        getDiscountBps: dto.getDiscountBps ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        isActive: dto.isActive ?? true,
        isStackable: dto.isStackable ?? false,
        priority: dto.priority ?? 0,
        usageLimit: dto.usageLimit ?? null,
        usageLimitPerUser: dto.usageLimitPerUser ?? null,
      },
    });
  }

  async updateDiscount(id: string, dto: UpdateDiscountDto): Promise<Discount> {
    await this.getDiscount(id);
    this.validateTypeFields(dto);
    return this.prisma.discount.update({
      where: { id },
      data: {
        ...dto,
        startsAt: dto.startsAt !== undefined ? (dto.startsAt ? new Date(dto.startsAt) : null) : undefined,
        endsAt: dto.endsAt !== undefined ? (dto.endsAt ? new Date(dto.endsAt) : null) : undefined,
      },
    });
  }

  async deleteDiscount(id: string): Promise<void> {
    await this.getDiscount(id);
    // OrderDiscount.discountId is onDelete: SetNull — deleting a discount
    // never rewrites an order's own history, only stops the rule from
    // running again.
    await this.prisma.discount.delete({ where: { id } });
  }

  /**
   * WO-5.6's builder preview: what this DRAFT discount (not yet saved) would
   * have done to the last 30 days of real, DELIVERED orders. Capped at the
   * most recent 2,000 orders so a busy shop's preview stays fast — a sample
   * this size is already enough to show the shape of the impact.
   */
  async previewDiscount(dto: PreviewDiscountDto): Promise<{
    ordersAffected: number;
    ordersSampled: number;
    revenueGivenUp: number;
    marginImpact: number;
  }> {
    this.validateTypeFields(dto);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const orders = await this.prisma.order.findMany({
      where: { status: 'DELIVERED', deliveredAt: { gte: since } },
      take: 2000,
      orderBy: { deliveredAt: 'desc' },
      select: {
        shippingFee: true,
        items: { select: { id: true, productId: true, unitPrice: true, unitCost: true, quantity: true } },
      },
    });

    const productIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.productId).filter((id): id is string => id !== null)))];
    const categoryByProduct = await this.categoryIdsByProduct(productIds);

    const rule = toRule({
      id: 'preview',
      name: dto.name,
      type: dto.type,
      scope: dto.scope ?? 'ORDER',
      value: dto.value ?? 0,
      maxDiscount: dto.maxDiscount ?? null,
      minSubtotal: dto.minSubtotal ?? null,
      minQuantity: dto.minQuantity ?? null,
      productIds: dto.productIds ?? [],
      categoryIds: dto.categoryIds ?? [],
      customerSegmentId: dto.customerSegmentId ?? null,
      firstOrderOnly: false, // a 30-day sample of past orders is never "this customer's first order" — the preview measures what the rule removes, not eligibility timing.
      buyQuantity: dto.buyQuantity ?? null,
      getQuantity: dto.getQuantity ?? null,
      getDiscountBps: dto.getDiscountBps ?? null,
      startsAt: null,
      endsAt: null,
      isActive: true,
      isStackable: dto.isStackable ?? false,
      priority: dto.priority ?? 0,
      usageLimit: null,
      usageLimitPerUser: null,
      usageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Discount);

    let ordersAffected = 0;
    let revenueGivenUp = 0;
    let marginImpact = 0;

    for (const order of orders) {
      const cart: CartSnapshot = {
        lines: order.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          categoryIds: item.productId ? categoryByProduct.get(item.productId) ?? [] : [],
          unitPrice: item.unitPrice,
          quantity: item.quantity,
        })),
        shippingFee: order.shippingFee,
      };
      const result = evaluateDiscounts(cart, [rule], { isFirstOrder: false });
      const lineTotal = Object.entries(result.linePerUnitDiscounts).reduce((sum, [lineId, perUnit]) => {
        const item = order.items.find((i) => i.id === lineId);
        return sum + perUnit * (item?.quantity ?? 0);
      }, 0);
      const totalOff = result.orderDiscount + result.shippingDiscount + lineTotal;
      if (totalOff <= 0) continue;

      ordersAffected += 1;
      revenueGivenUp += totalOff;
      // Margin impact assumes the discount comes straight off contribution —
      // COGS is unaffected by a price cut, so every rupee given up is a
      // rupee off margin. Line-level discounts are exact per unit; the
      // order-level and shipping portions have no single line to charge, so
      // they are attributed to the order as a whole the same way.
      marginImpact -= totalOff;
    }

    return { ordersAffected, ordersSampled: orders.length, revenueGivenUp, marginImpact };
  }

  /** Public so OrdersService can resolve a cart's category ids the same way the preview does — see CheckoutCartLine's own doc comment. */
  async categoryIdsByProduct(productIds: string[]): Promise<Map<string, string[]>> {
    if (productIds.length === 0) return new Map();
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, categoryId: true },
    });
    return new Map(products.map((p) => [p.id, p.categoryId ? [p.categoryId] : []]));
  }

  // ---------------------------------------------------------------------
  // Promo codes
  // ---------------------------------------------------------------------

  async listPromoCodes(query: PromoCodeQueryDto): Promise<PaginatedResult<PromoCode & { discountName: string }>> {
    const where: Prisma.PromoCodeWhereInput = {
      ...(query.discountId ? { discountId: query.discountId } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.q ? { code: { contains: query.q.toUpperCase() } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.promoCode.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: query.order },
        include: { discount: { select: { name: true } } },
      }),
      this.prisma.promoCode.count({ where }),
    ]);
    return paginated(
      rows.map(({ discount, ...row }) => ({ ...row, discountName: discount.name })),
      total,
      query,
    );
  }

  async createPromoCode(dto: CreatePromoCodeDto): Promise<PromoCode> {
    await this.getDiscount(dto.discountId);
    const code = (dto.code ?? generateHumanCode(8)).toUpperCase();
    try {
      return await this.prisma.promoCode.create({
        data: {
          discountId: dto.discountId,
          code,
          usageLimit: dto.usageLimit ?? null,
          restrictedToUserId: dto.restrictedToUserId ?? null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('That code is already in use.');
      }
      throw error;
    }
  }

  async bulkGeneratePromoCodes(dto: BulkGeneratePromoCodesDto): Promise<{ batchId: string; count: number }> {
    await this.getDiscount(dto.discountId);
    const batchId = `batch_${Date.now()}_${generateHumanCode(6)}`;
    const prefix = dto.prefix ? `${dto.prefix.toUpperCase()}-` : '';

    // Generate more than needed and dedupe against a fresh random suffix on
    // any collision, rather than a placement loop that could spin forever —
    // the alphabet's collision odds at 8 chars make a retry vanishingly rare.
    const codes = new Set<string>();
    while (codes.size < dto.count) {
      codes.add(`${prefix}${generateHumanCode(8)}`);
    }

    await this.prisma.promoCode.createMany({
      data: [...codes].map((code) => ({
        discountId: dto.discountId,
        code,
        batchId,
        usageLimit: dto.usageLimit ?? 1,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      })),
      skipDuplicates: true,
    });

    return { batchId, count: codes.size };
  }

  async updatePromoCode(id: string, dto: UpdatePromoCodeDto): Promise<PromoCode> {
    const existing = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Promo code not found.');
    return this.prisma.promoCode.update({
      where: { id },
      data: {
        isActive: dto.isActive,
        usageLimit: dto.usageLimit,
        restrictedToUserId: dto.restrictedToUserId,
        expiresAt: dto.expiresAt !== undefined ? (dto.expiresAt ? new Date(dto.expiresAt) : null) : undefined,
      },
    });
  }

  async deletePromoCode(id: string): Promise<void> {
    const existing = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Promo code not found.');
    await this.prisma.promoCode.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------
  // Checkout — read-only evaluation, called before OrdersService opens its
  // transaction (House Rule 11: identical to the storefront's own preview
  // call, evaluateDiscounts is pure so both get the same answer).
  // ---------------------------------------------------------------------

  async activeDiscountRules(now: Date = new Date()): Promise<Discount[]> {
    return this.prisma.discount.findMany({
      where: {
        isActive: true,
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
    });
  }

  /** Validates a typed code without redeeming it — throws with a customer-facing reason. */
  async resolvePromoCode(code: string, userId: string | null, now: Date = new Date()): Promise<{ promoCode: PromoCode; discount: Discount }> {
    const promoCode = await this.prisma.promoCode.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: { discount: true },
    });
    if (!promoCode || !promoCode.isActive) throw new BadRequestException('That promo code is not valid.');
    if (promoCode.expiresAt && promoCode.expiresAt < now) throw new BadRequestException('That promo code has expired.');
    if (promoCode.usageLimit !== null && promoCode.usageCount >= promoCode.usageLimit) {
      throw new BadRequestException('That promo code has been fully redeemed.');
    }
    if (promoCode.restrictedToUserId && promoCode.restrictedToUserId !== userId) {
      throw new BadRequestException('That promo code is not valid for this account.');
    }
    const { discount } = promoCode;
    if (!discount.isActive) throw new BadRequestException('That promo code is not valid.');
    if (discount.startsAt && discount.startsAt > now) throw new BadRequestException('That promo code is not active yet.');
    if (discount.endsAt && discount.endsAt < now) throw new BadRequestException('That promo code has expired.');
    if (discount.usageLimit !== null && discount.usageCount >= discount.usageLimit) {
      throw new BadRequestException('That promo code has been fully redeemed.');
    }
    return { promoCode, discount };
  }

  private async isFirstOrder(userId: string | null): Promise<boolean> {
    if (!userId) return false; // guest checkout is never eligible for a first-order discount — see promotions.service.ts's own note.
    const count = await this.prisma.order.count({ where: { userId } });
    return count === 0;
  }

  private async perUserUsage(discountId: string, promoCodeId: string | null, userId: string | null): Promise<number> {
    if (!userId) return 0;
    return this.prisma.orderDiscount.count({
      where: { discountId, order: { userId }, ...(promoCodeId ? { promoCodeId } : {}) },
    });
  }

  /**
   * Everything a checkout needs, read-only: resolves an optional promo code,
   * loads every active automatic discount, and runs the pure evaluator.
   * Safe to call for a storefront preview or before OrdersService's own
   * transaction opens — it touches no usage counters.
   */
  async evaluateForCheckout(input: {
    lines: CheckoutCartLine[];
    shippingFee: number;
    userId: string | null;
    promoCode?: string;
  }): Promise<CheckoutDiscountResult> {
    const now = new Date();
    const isFirstOrder = await this.isFirstOrder(input.userId);
    const automatic = await this.activeDiscountRules(now);

    let promoCode: PromoCode | null = null;
    let codedDiscount: Discount | null = null;
    if (input.promoCode) {
      const resolved = await this.resolvePromoCode(input.promoCode, input.userId, now);
      promoCode = resolved.promoCode;
      codedDiscount = resolved.discount;
    }

    const discounts = codedDiscount && !automatic.some((d) => d.id === codedDiscount!.id) ? [...automatic, codedDiscount] : automatic;

    // A per-user limit (Discount.usageLimitPerUser / a promo code carries no
    // separate per-user field, only Discount does) is a database read the
    // pure evaluator must not do — filter it out here before evaluation
    // rather than after, so a customer who has exhausted their own limit
    // simply never sees the discount apply, exactly like an expired one.
    const eligibleByPerUserLimit: Discount[] = [];
    for (const discount of discounts) {
      if (discount.usageLimitPerUser === null) {
        eligibleByPerUserLimit.push(discount);
        continue;
      }
      const used = await this.perUserUsage(discount.id, promoCode?.discountId === discount.id ? promoCode.id : null, input.userId);
      if (used < discount.usageLimitPerUser) eligibleByPerUserLimit.push(discount);
    }

    const cart: CartSnapshot = { lines: input.lines, shippingFee: input.shippingFee };
    const result = evaluateDiscounts(cart, eligibleByPerUserLimit.map(toRule), { isFirstOrder });

    // A promo code the customer typed but that didn't end up applying
    // (its own discount wasn't eligible — e.g. minSubtotal not met) is not
    // silently accepted: charging no discount while claiming the code
    // "worked" would be a support ticket.
    if (promoCode && codedDiscount && !result.applied.some((a) => a.discountId === codedDiscount!.id)) {
      throw new BadRequestException('That promo code does not apply to this order.');
    }

    return { result, discountsById: new Map(discounts.map((d) => [d.id, d])), promoCode };
  }

  /**
   * Commits what evaluateForCheckout() decided: conditional usage-count
   * increments (the same "lose the race, abort the transaction" idiom as
   * PromoCode.updateMany's own guard in the WO-5.2 brief) plus the
   * OrderDiscount snapshot rows. Called from INSIDE OrdersService's own
   * order-creation transaction — a lost race here rolls back the whole
   * order, which is exactly WO-5's exit criterion #2.
   */
  async redeemInTransaction(
    tx: PrismaLike,
    input: {
      orderId: string;
      orderNumber: string;
      evaluation: CheckoutDiscountResult;
    },
  ): Promise<void> {
    const { result, discountsById, promoCode } = input.evaluation;
    if (result.applied.length === 0) return;

    for (const applied of result.applied) {
      const discount = discountsById.get(applied.discountId);
      if (discount && discount.usageLimit !== null) {
        const updated = await tx.discount.updateMany({
          where: { id: discount.id, usageCount: { lt: discount.usageLimit } },
          data: { usageCount: { increment: 1 } },
        });
        if (updated.count === 0) {
          throw new BadRequestException(`"${discount.name}" has just been fully redeemed. Please remove it and try again.`);
        }
      } else if (discount) {
        await tx.discount.update({ where: { id: discount.id }, data: { usageCount: { increment: 1 } } });
      }

      await tx.orderDiscount.create({
        data: {
          orderId: input.orderId,
          discountId: applied.discountId,
          promoCodeId: promoCode && promoCode.discountId === applied.discountId ? promoCode.id : null,
          name: applied.name,
          type: applied.type,
          amount: applied.amount,
        },
      });
    }

    if (promoCode) {
      if (promoCode.usageLimit !== null) {
        const updated = await tx.promoCode.updateMany({
          where: { id: promoCode.id, usageCount: { lt: promoCode.usageLimit } },
          data: { usageCount: { increment: 1 } },
        });
        if (updated.count === 0) {
          throw new BadRequestException('That code has just been fully redeemed. Please remove it and try again.');
        }
      } else {
        await tx.promoCode.update({ where: { id: promoCode.id }, data: { usageCount: { increment: 1 } } });
      }
    }

    const total = result.applied.reduce((sum, a) => sum + a.amount, 0);
    const primary = result.applied[0]!;
    await this.events.publish(
      DomainEvent.DiscountRedeemed,
      {
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        discountId: primary.discountId,
        promoCodeId: promoCode?.id ?? null,
        name: result.applied.map((a) => a.name).join(', '),
        type: primary.type,
        amount: total,
      },
      tx,
    );
  }
}
