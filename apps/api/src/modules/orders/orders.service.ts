import { documentPrefix } from '../../core/settings/document-prefix';
import { documentNumber } from '../../core/settings/document-number';
import { AppConfigService } from '../../core/config/app-config.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  computeLineItem,
  computeOrderTotals,
  computeShippingFee,
  DEFAULT_LOCALE,
  getVariantDisplayLabel,
  normalizePkPhone,
  pickTranslation,
  stitchingFeeFor,
  taxExclusive,
  taxInclusive,
  type Locale,
} from '@newax/shared';
import { AuditService } from '../../core/audit/audit.service';
import { CheckoutValidatorRegistry } from '../../core/checkout/checkout-validator.registry';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import { EntityEnrichmentRegistry } from '../../core/extension-points/entity-enrichment.registry';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { paginated } from '../../core/common/dto/pagination.dto';
import { Prisma, type OrderStatus } from '../../core/prisma/client';
import { PaymentsService } from '../payments/payments.service';
import { TaxService } from '../tax/tax.service';
import type { PlaceOrderDto } from './dto/order.dto';

export interface PosSaleLineInput {
  variantId: string;
  quantity: number;
}

export interface PlaceFromPosInput {
  locationId: string;
  terminalId: string;
  shiftId: string;
  cashierUserId: string;
  lines: PosSaleLineInput[];
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
}

/**
 * Which status may follow which. A shop that can jump an order straight from
 * PENDING to DELIVERED loses the ability to answer "where is my parcel".
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['READY_TO_SHIP', 'CANCELLED'],
  READY_TO_SHIP: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

const orderInclude = {
  // The tailoring progress for a stitched line (the customer order page shows
  // the same stage rail as a standalone booking) used to be a Prisma relation
  // include here. It is attached after the query now, via
  // EntityEnrichmentRegistry — core no longer types a `stitchingJob` field at
  // all, so this file compiles and this query runs identically whether or
  // not the `stitching` module (or any pack) is enabled. See
  // attachStitchingJobs() below.
  items: {
    orderBy: { createdAt: 'asc' },
  },
  payments: { orderBy: { createdAt: 'desc' } },
  shipments: { orderBy: { createdAt: 'desc' } },
  statusEvents: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

import { InventoryService, InsufficientStockError } from '../inventory/inventory.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
    private readonly inventory: InventoryService,
    private readonly enrichment: EntityEnrichmentRegistry,
    private readonly checkoutValidators: CheckoutValidatorRegistry,
    private readonly tax: TaxService,
  ) {}

  /**
   * Attaches each order item's `stitchingJob` (null when there isn't one),
   * exactly the shape the old Prisma include produced, so every caller below
   * — and the web/mobile clients reading their response — sees no difference.
   */
  private async attachStitchingJobs<
    T extends { items: ReadonlyArray<{ id: string }> },
  >(orderOrOrders: T | T[]): Promise<T | T[]> {
    const orders = Array.isArray(orderOrOrders) ? orderOrOrders : [orderOrOrders];
    const itemIds = orders.flatMap((order) => order.items.map((item) => item.id));
    const jobs = await this.enrichment.enrich('orderItem.stitchingJob', itemIds);
    for (const order of orders) {
      for (const item of order.items) {
        (item as unknown as { stitchingJob: unknown }).stitchingJob = jobs.get(item.id) ?? null;
      }
    }
    return orderOrOrders;
  }

  /**
   * Turns a cart into an order.
   *
   * Everything happens in ONE transaction: re-price from the database, check
   * and decrement stock, snapshot each line, write the order and its payment,
   * empty the cart, and queue `order.placed` in the outbox. Either all of it
   * lands or none of it does — there is no state where stock was taken but no
   * order exists, or an order exists that the CRM and tailor queue never hear
   * about.
   */
  async place(
    cartToken: string | undefined,
    userId: string | undefined,
    dto: PlaceOrderDto,
    locale: Locale = DEFAULT_LOCALE,
  ) {
    const cart = await this.loadCart(cartToken, userId);

    if (cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty.');
    }

    const phone = normalizePkPhone(dto.shippingAddress.phone).e164;
    if (!phone) {
      throw new BadRequestException(
        'Enter a valid phone number — the courier needs it.',
      );
    }

    // Re-price from the database. The client sends no amounts at all.
    const priced = await this.priceCart(cart, locale);

    const zone = await this.settings.resolveShippingZone(dto.shippingAddress.city);
    const goodsSubtotal = priced.totals.itemsSubtotal + priced.totals.stitchingSubtotal;
    const shippingFee = computeShippingFee(goodsSubtotal, zone);
    const paymentFee = await this.payments.feeFor(dto.paymentMethod, goodsSubtotal);

    const totals = computeOrderTotals({
      items: priced.lines.map((line) => ({
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        stitchingFeePerUnit: line.stitchingFeeUnit,
      })),
      shippingFee,
      codFee: paymentFee,
      // Already correctly gated to EXCLUSIVE-mode-only inside priceCart()'s
      // own computeOrderTotals call -- reused here rather than re-derived,
      // per the rounding-trap discipline (one source of truth, never two).
      taxAmount: priced.totals.taxAmount,
    });

    const allowBackorder = await this.settings.get<boolean>(SettingKey.OrdersAllowBackorder);

    const minimum = await this.settings.get<number>(SettingKey.MinOrderValue);
    if (goodsSubtotal < minimum) {
      throw new BadRequestException(
        `Orders start at Rs ${Math.round(minimum / 100)}. Add a little more to your cart.`,
      );
    }

    // B3 (MULTI-SECTOR.md): the one hook age gating, prescription
    // verification, credit limits and approval holds each need. No pack
    // registers a validator today, so this is always an empty check.
    const vetoes = await this.checkoutValidators.validateAll({
      userId: userId ?? null,
      contactId: null,
      items: priced.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
      })),
      totalAmount: totals.grandTotal,
    });
    if (vetoes.length > 0) {
      throw new BadRequestException(vetoes.map((veto) => veto.message).join(' '));
    }

    // Reserved before checkout's own transaction opens — see
    // nextOrderNumber() for why this has to be a separate atomic step
    // rather than something computed inside that transaction.
    const orderNumber = await nextOrderNumber(this.prisma, this.settings, this.config);

    const order = await this.prisma.$transaction(async (tx) => {
      const variantIds = [...new Set(priced.lines.map(l => l.variantId))];
      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, costPrice: true, producedInHouse: true },
      });
      const costMap = new Map(variants.map(v => [v.id, v.costPrice]));
      const producedInHouseMap = new Map(variants.map(v => [v.id, v.producedInHouse]));

      const created = await tx.order.create({
        data: {
          number: orderNumber,
          userId: userId ?? null,
          status: 'PENDING',
          guestName: dto.shippingAddress.fullName,
          guestEmail: dto.email ?? null,
          guestPhone: phone,
          shippingAddress: { ...dto.shippingAddress, phone } as Prisma.InputJsonValue,
          itemsSubtotal: totals.itemsSubtotal,
          stitchingSubtotal: totals.stitchingSubtotal,
          itemDiscountTotal: totals.itemDiscountTotal,
          orderDiscount: totals.orderDiscount,
          shippingFee: totals.shippingFee,
          codFee: totals.codFee,
          taxAmount: totals.taxAmount,
          grandTotal: totals.grandTotal,
          shippingZone: zone.key,
          customerNote: dto.note ?? null,
          items: {
            create: priced.lines.map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              kind: line.kind,
              nameEn: line.nameEn,
              nameUr: line.nameUr,
              sku: line.sku,
              imageUrl: line.imageUrl,
              variantLabel: line.variantLabel,
              unitPrice: line.unitPrice,
              unitCost: costMap.get(line.variantId) ?? 0,
              quantity: line.quantity,
              stitchingFeeUnit: line.stitchingFeeUnit,
              lineTotal: line.lineTotal,
              taxAmount: line.taxAmount,
              taxRateBps: line.taxRateBps,
              stitchingServiceId: line.stitchingServiceId,
              stitchingServiceName: line.stitchingServiceName,
              garmentTypeKey: line.garmentTypeKey,
              measurementSnapshot: jsonOrNull(line.measurementSnapshot),
              optionsSnapshot: jsonOrNull(line.optionsSnapshot),
              stitchingNotes: line.stitchingNotes,
              measurementValues: jsonOrNull(line.measurementValues),
              customDesignText: jsonOrNull(line.customDesignText),
              sizeToken: line.sizeToken,
            })),
          },
          statusEvents: {
            create: { toStatus: 'PENDING', note: 'Order placed' },
          },
        },
        include: orderInclude,
      });

      const locationId = await this.inventory.defaultLocationId(tx);
      // Sorted by variantId, same as moveMany()'s own internal ordering —
      // this is the actual lock order two concurrent checkouts touching the
      // same variants must agree on to avoid a deadlock (see "survives
      // opposite-order checkouts" in orders.e2e-spec.ts). item.id as the
      // tiebreaker only matters when two lines share a variantId (same
      // product, different stitching options) and doesn't affect lock order.
      const sortedItems = [...created.items].sort((a, b) => {
        const byVariant = (a.variantId ?? '').localeCompare(b.variantId ?? '');
        return byVariant !== 0 ? byVariant : a.id.localeCompare(b.id);
      });
      const backorderedStockIds: string[] = [];
      const backorderedProductionIds: string[] = [];
      for (const item of sortedItems) {
        if (!item.variantId) continue; // a stitching-service line has no stock to move
        try {
          await this.inventory.move({
            variantId: item.variantId,
            locationId,
            delta: -item.quantity,
            reason: 'SALE',
            refType: 'Order',
            refId: created.id,
            unitCost: costMap.get(item.variantId) ?? 0,
          }, tx);
        } catch (error) {
          if (error instanceof InsufficientStockError) {
            if (!allowBackorder) {
              throw new BadRequestException(`${item.nameEn} sold out while you were checking out. Please adjust your cart.`);
            }
            // Ship-safe default keeps today's behavior (the throw above);
            // only with checkout.allow_backorder on does a line get parked
            // instead of failing the whole order. backorder.listener.ts
            // (@OnDomainEvent(StockReplenished)) allocates the stock and
            // flips it to READY automatically once it exists.
            if (producedInHouseMap.get(item.variantId)) {
              backorderedProductionIds.push(item.id);
            } else {
              backorderedStockIds.push(item.id);
            }
            continue;
          }
          throw error;
        }
      }

      if (backorderedStockIds.length > 0) {
        await tx.orderItem.updateMany({
          where: { id: { in: backorderedStockIds } },
          data: { fulfillmentStatus: 'AWAITING_STOCK', awaitingSince: new Date() },
        });
      }
      if (backorderedProductionIds.length > 0) {
        await tx.orderItem.updateMany({
          where: { id: { in: backorderedProductionIds } },
          data: { fulfillmentStatus: 'AWAITING_PRODUCTION', awaitingSince: new Date() },
        });
      }

      const payment = await this.payments.createForOrder(tx, dto.paymentMethod, {
        orderId: created.id,
        orderNumber: created.number,
        amount: created.grandTotal,
        customerName: dto.shippingAddress.fullName,
        customerPhone: phone,
        customerEmail: dto.email ?? null,
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      await this.events.publish(
        DomainEvent.OrderPlaced,
        {
          orderId: created.id,
          orderNumber: created.number,
          userId: userId ?? null,
          customerName: dto.shippingAddress.fullName,
          customerPhone: phone,
          customerEmail: dto.email ?? null,
          grandTotal: created.grandTotal,
          placedAt: created.placedAt.toISOString(),
          stitchingItemIds: created.items
            .filter((item) => item.garmentTypeKey)
            .map((item) => item.id),
        },
        tx,
      );

      return { ...created, payment };
    }, {
      // Headroom over Prisma's 5s default for a slow/loaded runner. This
      // transaction no longer contends with other checkouts over anything
      // lock-shaped (order numbering is reserved beforehand, see
      // nextOrderNumber() above) — 6 concurrent checkouts hitting a shared
      // CI Postgres container still occasionally lean on plain CPU/IO
      // contention, not a design flaw, so the budget stays generous.
      timeout: 20_000,
    });

    this.logger.log(`Order ${order.number} placed for ${order.grandTotal} paisa`);
    await this.attachStitchingJobs(order);
    return order;
  }

  /**
   * The till's sale path (RETAIL-ERP.md R11): `pos` resolves the shift/
   * terminal context and validates the shift is open, then hands a flat list
   * of {variantId, quantity} here — a deliberately separate, minimal method
   * from place(), not a reuse of it, because place() is wired through a cart,
   * a shipping address and stitching options none of which a till sale has.
   *
   * Three things a web order does that this does not, on purpose, quarantined
   * to a later work order rather than faked: no stitching line (a till sells
   * ready stock, WO-21.4+ if a shop wants to take stitching orders at the
   * counter), no tax lookup (TaxService integration for POS is unscoped
   * here), no backorder path — postUnconditional() below means there is
   * never a reason to park a line, only to record how far it oversold.
   *
   * Stock posts through postUnconditional(), never move(): R5 — a sale that
   * already happened at the till must not be rejected by sync. Payment is
   * created directly as a paid cash tender, bypassing PaymentsService's
   * provider registry (R11) — a till has no gateway callback to route
   * through. Status is set straight to DELIVERED at creation (the customer
   * already has the goods), which ALLOWED_TRANSITIONS never has to know
   * about since it only governs updateStatus(), not create().
   */
  async placeFromPos(input: PlaceFromPosInput) {
    if (input.lines.length === 0) {
      throw new BadRequestException('A sale needs at least one line.');
    }

    const variantIds = [...new Set(input.lines.map((line) => line.variantId))];
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, isActive: true },
      include: {
        product: {
          include: {
            translations: { where: { locale: DEFAULT_LOCALE }, take: 1 },
            images: { orderBy: { isPrimary: 'desc' }, take: 1 },
          },
        },
      },
    });
    const variantMap = new Map(variants.map((variant) => [variant.id, variant]));

    const missing = variantIds.filter((id) => !variantMap.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown or inactive variant(s): ${missing.join(', ')}`);
    }

    const lines = input.lines.map((line) => {
      const variant = variantMap.get(line.variantId)!;
      const unitPrice = variant.priceOverride ?? variant.product.basePrice;
      const lineTotals = computeLineItem({ unitPrice, quantity: line.quantity });
      const english = pickTranslation(variant.product.translations, 'en');
      return {
        variant,
        variantId: line.variantId,
        productId: variant.productId,
        quantity: line.quantity,
        unitPrice,
        lineTotal: lineTotals.lineTotal,
        nameEn: english?.name ?? variant.product.slug,
        imageUrl: variant.product.images[0]?.url ?? null,
        variantLabel: getVariantDisplayLabel(variant),
      };
    });

    const totals = computeOrderTotals({
      items: lines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
      shippingFee: 0,
      codFee: 0,
      taxAmount: 0,
    });

    const orderNumber = await nextOrderNumber(this.prisma, this.settings, this.config);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          number: orderNumber,
          status: 'DELIVERED',
          channel: 'POS',
          locationId: input.locationId,
          terminalId: input.terminalId,
          shiftId: input.shiftId,
          guestName: input.customerName ?? null,
          guestEmail: input.customerEmail ?? null,
          guestPhone: input.customerPhone ?? null,
          shippingAddress: {},
          itemsSubtotal: totals.itemsSubtotal,
          stitchingSubtotal: totals.stitchingSubtotal,
          itemDiscountTotal: totals.itemDiscountTotal,
          orderDiscount: totals.orderDiscount,
          shippingFee: totals.shippingFee,
          codFee: totals.codFee,
          taxAmount: totals.taxAmount,
          grandTotal: totals.grandTotal,
          deliveredAt: new Date(),
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              kind: line.variant.product.kind,
              nameEn: line.nameEn,
              sku: line.variant.sku,
              imageUrl: line.imageUrl,
              variantLabel: line.variantLabel,
              unitPrice: line.unitPrice,
              unitCost: line.variant.costPrice,
              quantity: line.quantity,
              lineTotal: line.lineTotal,
            })),
          },
          statusEvents: {
            create: { toStatus: 'DELIVERED', note: 'POS sale', actorId: input.cashierUserId },
          },
        },
        include: orderInclude,
      });

      // Sorted the same way moveMany() locks — see place()'s own comment on
      // sortedItems for why this matters under concurrent tills at the same
      // location.
      const sortedItems = [...created.items].sort((a, b) => (a.variantId ?? '').localeCompare(b.variantId ?? ''));
      for (const item of sortedItems) {
        if (!item.variantId) continue;
        const variant = variantMap.get(item.variantId)!;
        await this.inventory.postUnconditional(
          {
            variantId: item.variantId,
            locationId: input.locationId,
            delta: -item.quantity,
            reason: 'POS_SALE',
            refType: 'Order',
            refId: created.id,
            unitCost: variant.costPrice,
            actorId: input.cashierUserId,
          },
          tx,
        );
      }

      // A till's cash tender has no gateway callback to route through
      // PaymentsService's provider registry — it is paid the instant it is
      // rung up, so the Payment row is created directly rather than through
      // createForOrder()'s PENDING-then-webhook flow. PaymentSucceeded is
      // published by hand for the same reason createForOrder() would have:
      // posting-rules.subscriber.ts's Dr Cash & Bank / Cr AR only fires off
      // that event, and a cash sale must not sit in the books as an
      // uncollected receivable forever.
      const payment = await tx.payment.create({
        data: {
          orderId: created.id,
          provider: 'cash',
          amount: created.grandTotal,
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      await this.events.publish(
        DomainEvent.PaymentSucceeded,
        {
          paymentId: payment.id,
          orderId: created.id,
          provider: payment.provider,
          amount: payment.amount,
          status: payment.status,
        },
        tx,
      );

      await this.events.publish(
        DomainEvent.OrderPlaced,
        {
          orderId: created.id,
          orderNumber: created.number,
          userId: null,
          customerName: input.customerName ?? 'Walk-in customer',
          customerPhone: input.customerPhone ?? null,
          customerEmail: input.customerEmail ?? null,
          grandTotal: created.grandTotal,
          placedAt: created.placedAt.toISOString(),
          stitchingItemIds: [],
        },
        tx,
      );

      return { ...created, payment };
    });

    this.logger.log(`POS sale ${order.number} placed for ${order.grandTotal} paisa at terminal ${input.terminalId}`);
    return order;
  }

  async findByNumber(number: string, userId?: string, phone?: string) {
    const order = await this.prisma.order.findUnique({
      where: { number },
      include: orderInclude,
    });

    if (!order) throw new NotFoundException('No order with that number.');
    await this.attachStitchingJobs(order);

    // A signed-in customer sees their own orders; a guest must know the phone
    // number the order was placed with. Staff use the admin endpoints.
    const isOwner = userId && order.userId === userId;
    const matchesPhone =
      phone && order.guestPhone === normalizePkPhone(phone).e164;

    if (!isOwner && !matchesPhone) {
      throw new ForbiddenException(
        'Sign in, or supply the phone number this order was placed with.',
      );
    }

    return order;
  }

  async listForUser(userId: string, page = 1, pageSize = 20) {
    const where: Prisma.OrderWhereInput = { userId };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    await this.attachStitchingJobs(rows);
    return paginated(rows, total, { page, pageSize });
  }

  // --- Admin ---------------------------------------------------------------

  async adminList(query: {
    page: number;
    pageSize: number;
    skip: number;
    take: number;
    q?: string;
    status?: OrderStatus;
  }) {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;

    if (query.q?.trim()) {
      const term = query.q.trim();
      where.OR = [
        { number: { contains: term, mode: 'insensitive' } },
        { guestName: { contains: term, mode: 'insensitive' } },
        { guestPhone: { contains: term } },
        { guestEmail: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { placedAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.order.count({ where }),
    ]);

    await this.attachStitchingJobs(rows);
    return paginated(rows, total, query);
  }

  async adminGet(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('That order no longer exists.');
    await this.attachStitchingJobs(order);
    return order;
  }

  /**
   * Moves an order along, refusing transitions that make no sense and putting
   * cancelled stock back.
   */
  async changeStatus(
    actorId: string,
    orderId: string,
    toStatus: OrderStatus,
    note?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('That order no longer exists.');

    if (order.status === toStatus) return this.adminGet(orderId);

    if (!ALLOWED_TRANSITIONS[order.status].includes(toStatus)) {
      throw new BadRequestException(
        `An order that is ${order.status.toLowerCase()} cannot become ${toStatus.toLowerCase()}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: toStatus,
          ...(toStatus === 'CONFIRMED' ? { confirmedAt: new Date() } : {}),
          ...(toStatus === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
          ...(toStatus === 'CANCELLED' ? { cancelledAt: new Date(), cancelReason: note ?? null } : {}),
        },
      });

      await tx.orderStatusEvent.create({
        data: { orderId, fromStatus: order.status, toStatus, note: note ?? null, actorId },
      });

      // Cancelling or returning releases the stock back to the shelf — at the
      // location it was actually sold from (order.locationId, set for a POS
      // sale by placeFromPos(), WO-21.3) rather than always the default one.
      // A web order has no locationId, so it still falls back to the default
      // — exactly today's behavior, unchanged for every order this doesn't apply to.
      if (toStatus === 'CANCELLED' || toStatus === 'RETURNED') {
        const moveReason = toStatus === 'CANCELLED' ? 'CANCELLATION' : 'RETURN';
        const locationId = order.locationId ?? (await this.inventory.defaultLocationId(tx));
        await this.inventory.moveMany(
          order.items.filter(i => i.variantId).map(item => ({
            variantId: item.variantId!,
            locationId,
            delta: item.quantity,
            reason: moveReason,
            refType: 'Order',
            refId: order.id,
            actorId,
          })),
          tx
        );
      }

      await this.events.publish(
        toStatus === 'CANCELLED' ? DomainEvent.OrderCancelled : DomainEvent.OrderStatusChanged,
        {
          orderId,
          orderNumber: order.number,
          fromStatus: order.status,
          toStatus,
          actorId,
        },
        tx,
      );
    });

    await this.audit.record({
      actorId,
      action: 'order.status_changed',
      entity: 'Order',
      entityId: orderId,
      data: { from: order.status, to: toStatus, note },
    });

    return this.adminGet(orderId);
  }

  async addShipment(
    actorId: string,
    orderId: string,
    input: { courier: string; trackingNumber?: string; trackingUrl?: string },
  ) {
    const shipment = await this.prisma.shipment.create({
      data: {
        orderId,
        courier: input.courier,
        trackingNumber: input.trackingNumber ?? null,
        trackingUrl: input.trackingUrl ?? null,
        status: 'DISPATCHED',
        dispatchedAt: new Date(),
      },
    });

    await this.audit.record({
      actorId,
      action: 'order.shipment_added',
      entity: 'Order',
      entityId: orderId,
      data: { courier: input.courier, trackingNumber: input.trackingNumber },
    });

    return shipment;
  }

  // --- internals -----------------------------------------------------------

  private async loadCart(token: string | undefined, userId: string | undefined) {
    const cart = userId
      ? await this.prisma.cart.findFirst({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          include: cartInclude,
        })
      : token
        ? await this.prisma.cart.findUnique({ where: { token }, include: cartInclude })
        : null;

    if (!cart) {
      throw new BadRequestException('Your cart is empty.');
    }
    return cart;
  }

  /**
   * Prices the cart and builds the line snapshots.
   *
   * Every field an order line keeps — name, price, measurements, options — is
   * captured here, so the order is readable years later even if the product is
   * renamed, repriced or archived.
   */
  private async priceCart(cart: CartWithRelations, locale: Locale) {
    const designAreas = await this.customTextAreas(cart);

    // MeasurementProfile is apparel-owned; CartItem (core) keeps only the
    // scalar measurementProfileId, no Prisma relation (B7, MULTI-SECTOR.md).
    // Batch-fetch the profiles referenced by this cart up front rather than
    // per line.
    const profileIds = [
      ...new Set(
        cart.items
          .map((item) => item.measurementProfileId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const profiles =
      profileIds.length === 0
        ? []
        : await this.prisma.measurementProfile.findMany({
            where: { id: { in: profileIds } },
            include: { garmentType: { select: { key: true } } },
          });
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

    // Same story for GarmentType — CartItem.garmentTypeId is a scalar, no
    // relation. Needed to resolve OrderItem.garmentTypeKey even when the
    // customer typed measurements in rather than picking a saved profile.
    const garmentTypeIds = [
      ...new Set(
        cart.items
          .map((item) => item.garmentTypeId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const garmentTypes =
      garmentTypeIds.length === 0
        ? []
        : await this.prisma.garmentType.findMany({
            where: { id: { in: garmentTypeIds } },
            select: { id: true, key: true, labelEn: true, stitchingPrice: true },
          });
    const garmentTypeById = new Map(garmentTypes.map((garmentType) => [garmentType.id, garmentType]));

    // Tax (15-tax-module.md). tax.enabled defaults false, in which case every
    // line's taxAmount stays 0 and grandTotal is byte-identical to a build
    // with no tax module at all -- resolving rates only when it is actually on.
    const taxEnabled = await this.settings.get<boolean>(SettingKey.TaxEnabled);
    const taxPricingMode = taxEnabled
      ? await this.settings.get<'INCLUSIVE' | 'EXCLUSIVE'>(SettingKey.TaxPricingMode)
      : 'EXCLUSIVE';
    const [taxRatesByClassId, defaultTaxClassId] = taxEnabled
      ? await Promise.all([this.tax.activeRatesByClassId(), this.tax.defaultClassId()])
      : [new Map<string, number>(), null];

    const lines = cart.items.map((item) => {
      const unitPrice = item.variant.priceOverride ?? item.product.basePrice;

      const options = item.stitchingOptions.map((selection) => ({
        groupKey: selection.option.group.key,
        groupLabelEn: selection.option.group.labelEn,
        groupLabelUr: selection.option.group.labelUr,
        key: selection.option.key,
        labelEn: selection.option.labelEn,
        labelUr: selection.option.labelUr,
        priceDelta: selection.option.priceDelta,
        custom: false,
      }));

      // A described area is a style choice like any other, so it joins the same
      // list — the tailor's worksheet and the customer's order page both read
      // it without either screen learning a second shape.
      const described = Object.entries(
        (item.customDesignText as Record<string, string> | null) ?? {},
      ).map(([groupKey, text]) => {
        const area = designAreas.get(groupKey);
        return {
          groupKey,
          groupLabelEn: area?.labelEn ?? groupKey,
          groupLabelUr: area?.labelUr ?? groupKey,
          key: 'custom',
          labelEn: text,
          labelUr: text,
          priceDelta: 0,
          custom: true,
        };
      });

      const garmentType = item.garmentTypeId ? garmentTypeById.get(item.garmentTypeId) : undefined;

      const stitchingFeeUnit = stitchingFeeFor(
        {
          garmentType: garmentType ? { stitchingPrice: garmentType.stitchingPrice } : null,
          stitchingService: item.stitchingService,
        },
        options.map((option) => option.priceDelta),
      );

      // measurementProfileId has no DB-level onDelete: SetNull any more — it
      // is a bare scalar (B7, MULTI-SECTOR.md), not a Prisma relation to
      // MeasurementProfile — so a profile deleted after the line was added
      // leaves a dangling id rather than nulling it out. Check the id
      // actually still resolves, not just that it is set.
      const hasProfile = item.measurementProfileId
        ? profileById.has(item.measurementProfileId)
        : false;
      if (item.garmentTypeId && !hasProfile && !item.measurementValues) {
        throw new BadRequestException(
          `Add measurements for the stitched ${garmentType?.labelEn ?? 'garment'} before checking out.`,
        );
      }

      const english = pickTranslation(item.product.translations, 'en');
      const urdu = item.product.translations.find((row) => row.locale === 'ur');
      const image =
        item.product.images.find((candidate) => candidate.isPrimary) ??
        item.product.images[0];

      const lineTotal = (unitPrice + stitchingFeeUnit) * item.quantity;

      // Tax on this line, snapshotted below onto the OrderItem. taxRateBps
      // stays 0 (not looked up) when tax is off, per the tax.enabled=false
      // ship-safe default in 15-tax-module.md.
      let taxAmount = 0;
      let taxRateBps = 0;
      if (taxEnabled) {
        const effectiveClassId = item.variant.taxClassId ?? defaultTaxClassId;
        const rateBps = effectiveClassId ? taxRatesByClassId.get(effectiveClassId) : undefined;
        if (rateBps !== undefined) {
          const result =
            taxPricingMode === 'INCLUSIVE'
              ? taxInclusive(lineTotal, rateBps)
              : taxExclusive(lineTotal, rateBps);
          taxAmount = result.taxAmount;
          taxRateBps = rateBps;
        }
      }

      return {
        productId: item.productId,
        variantId: item.variantId,
        kind: item.product.kind,
        nameEn: english?.name ?? item.product.slug,
        nameUr: urdu?.name ?? null,
        sku: item.variant.sku,
        imageUrl: image?.url ?? null,
        variantLabel: getVariantDisplayLabel(item.variant),
        unitPrice,
        quantity: item.quantity,
        stitchingFeeUnit,
        lineTotal,
        taxAmount,
        taxRateBps,
        stitchingServiceId: item.stitchingServiceId,
        stitchingServiceName: item.stitchingService
          ? (pickTranslation(item.stitchingService.translations, locale)?.name ??
            item.stitchingService.slug)
          : null,
        garmentTypeKey: garmentType?.key ?? null,
        measurementSnapshot: measurementSnapshotFor(item, profileById, garmentType?.key ?? null),
        optionsSnapshot:
          options.length + described.length > 0 ? [...options, ...described] : null,
        stitchingNotes: item.stitchingNotes,
        measurementValues: item.measurementValues,
        customDesignText: item.customDesignText,
        sizeToken: item.sizeToken,
      };
    });

    // EXCLUSIVE mode adds tax on top of grandTotal; INCLUSIVE mode's tax is
    // already inside unitPrice/lineTotal above, so it must NOT be added again
    // here (that would double-count it) -- it is only ever extracted for
    // display. See the rounding-trap note on OrderTotalsInput.taxAmount:
    // this sum of already-rounded per-line amounts is the only correct
    // source, never a separate order-level recomputation.
    const taxAmountForTotals =
      taxEnabled && taxPricingMode === 'EXCLUSIVE'
        ? lines.reduce((sum, line) => sum + line.taxAmount, 0)
        : 0;

    const totals = computeOrderTotals({
      taxAmount: taxAmountForTotals,
      items: lines.map((line) => ({
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        stitchingFeePerUnit: line.stitchingFeeUnit,
      })),
    });

    return { lines, totals };
  }

  /**
   * Labels for the design areas the customer described in their own words.
   *
   * Read once for the whole cart, so the snapshot can name the area rather than
   * leave the workshop holding a bare key.
   */
  private async customTextAreas(cart: CartWithRelations) {
    const keys = cart.items.flatMap((item) =>
      Object.keys((item.customDesignText as Record<string, string> | null) ?? {}),
    );

    const groups =
      keys.length > 0
        ? await this.prisma.stitchingOptionGroup.findMany({
            where: { key: { in: keys } },
            select: { key: true, labelEn: true, labelUr: true },
          })
        : [];

    return new Map(groups.map((group) => [group.key, group]));
  }
}

const cartInclude = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      product: { include: { translations: true, images: true } },
      variant: true,
      
      stitchingService: { include: { translations: true } },
      stitchingOptions: { include: { option: { include: { group: true } } } },
    },
  },
} satisfies Prisma.CartInclude;

type CartWithRelations = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

type MeasurementProfileForSnapshot = Prisma.MeasurementProfileGetPayload<{
  include: { garmentType: { select: { key: true } } };
}>;

/**
 * The measurements the workshop will cut to.
 *
 * A saved profile and an inline entry are the same thing to a tailor, so both
 * collapse into one shape here and the job sheet never has to know which door
 * the numbers came in through. MeasurementProfile is apparel-owned, so the
 * caller batch-fetches it and passes the lookup map in — CartItem itself
 * only ever carries the scalar measurementProfileId (B7, MULTI-SECTOR.md).
 */
function measurementSnapshotFor(
  item: CartWithRelations['items'][number],
  profileById: Map<string, MeasurementProfileForSnapshot>,
  garmentTypeKey: string | null,
) {
  const profile = item.measurementProfileId ? profileById.get(item.measurementProfileId) : undefined;
  if (profile) {
    return {
      label: profile.label,
      garmentTypeKey: profile.garmentType.key,
      values: profile.values,
    };
  }

  if (item.measurementValues) {
    return {
      label: null,
      garmentTypeKey,
      values: item.measurementValues,
    };
  }

  return null;
}

/** Prisma wants an explicit marker rather than `null` for an empty Json column. */
function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue);
}

/**
 * Sequential order numbers per year: YSN-2026-0001, the prefix from BRAND —
 * or, once this deployment is part of a chain (WO-18.1's NODE_ROLE),
 * YSN-lhr-01-2026-0001, so two branches' locally-allocated numbers can
 * never collide once their facts merge upward (RETAIL-ERP.md R2, R6). See
 * core/settings/document-number.ts.
 *
 * Two earlier designs both got this wrong. Reading MAX(Order.number) and
 * adding one is a read-then-write, and READ COMMITTED (Postgres' default,
 * and Prisma's) takes no lock on that read — concurrent checkouts could
 * compute the same next number and all but one died on Order.number's
 * unique index, surfacing to the customer as a 409 at the moment of
 * payment. Wrapping that read in a transaction-scoped advisory lock fixed
 * the race only if the lock also covered the eventual Order insert — taking
 * it around the whole checkout transaction serialised every concurrent
 * checkout behind whichever one held it (slow, and only correct because it
 * was slow); taking it in its own short transaction, separate from the
 * insert, was faster but wrong: every short transaction reads MAX() before
 * any checkout has inserted its Order row, so they all still compute the
 * same number — the lock protected a read that had nothing left to race
 * against once the insert moved elsewhere.
 *
 * A counter row sidesteps the problem instead of re-serialising it: this
 * single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` both reads and
 * reserves the next number in one atomic step, which Postgres already
 * serialises at the row level — no application lock or transaction of our
 * own required. If place()'s transaction later fails, the number it
 * reserved is simply skipped, the same way a gap appears after any failed
 * insert on an auto-increment key.
 */
async function nextOrderNumber(
  prisma: PrismaService,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  // A Setting, defaulting to the brand's own initials. The number a
  // customer quotes back to you is the one place a shop is most likely to
  // already have a convention.
  const prefix = await documentPrefix(settings, 'order');

  const [{ counter }] = await prisma.$queryRaw<Array<{ counter: number }>>`
    INSERT INTO "OrderNumberCounter" ("year", "counter") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "counter" = "OrderNumberCounter"."counter" + 1
    RETURNING "counter"
  `;

  return documentNumber(config, prefix, year, counter);
}
