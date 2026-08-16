import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  computeOrderTotals,
  computeShippingFee,
  computeStitchingFee,
  DEFAULT_LOCALE,
  normalizePkPhone,
  type Locale,
} from '@yaseen/shared';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { paginated } from '../../core/common/dto/pagination.dto';
import type { OrderStatus, Prisma } from '../../core/prisma/client';
import { pickTranslation } from '../catalog/catalog.service';
import { PaymentsService } from '../payments/payments.service';
import type { PlaceOrderDto } from './dto/order.dto';

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
  items: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'desc' } },
  shipments: { orderBy: { createdAt: 'desc' } },
  statusEvents: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
  ) {}

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
        'Enter a valid Pakistani phone number — the courier needs it.',
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
    });

    const minimum = await this.settings.get<number>(SettingKey.MinOrderValue);
    if (goodsSubtotal < minimum) {
      throw new BadRequestException(
        `Orders start at Rs ${Math.round(minimum / 100)}. Add a little more to your cart.`,
      );
    }

    const order = await this.prisma.$transaction(async (tx) => {
      // Re-read stock inside the transaction and decrement conditionally, so
      // two customers racing for the last piece cannot both win.
      for (const line of priced.lines) {
        const updated = await tx.productVariant.updateMany({
          where: { id: line.variantId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });

        if (updated.count === 0) {
          throw new BadRequestException(
            `${line.nameEn} sold out while you were checking out. Please adjust your cart.`,
          );
        }
      }

      const created = await tx.order.create({
        data: {
          number: await nextOrderNumber(tx),
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
              quantity: line.quantity,
              stitchingFeeUnit: line.stitchingFeeUnit,
              lineTotal: line.lineTotal,
              stitchingServiceId: line.stitchingServiceId,
              stitchingServiceName: line.stitchingServiceName,
              garmentTypeKey: line.garmentTypeKey,
              measurementSnapshot: line.measurementSnapshot as Prisma.InputJsonValue,
              optionsSnapshot: line.optionsSnapshot as Prisma.InputJsonValue,
              stitchingNotes: line.stitchingNotes,
            })),
          },
          statusEvents: {
            create: { toStatus: 'PENDING', note: 'Order placed' },
          },
        },
        include: orderInclude,
      });

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
            .filter((item) => item.stitchingServiceId)
            .map((item) => item.id),
        },
        tx,
      );

      return { ...created, payment };
    });

    this.logger.log(`Order ${order.number} placed for ${order.grandTotal} paisa`);
    return order;
  }

  async findByNumber(number: string, userId?: string, phone?: string) {
    const order = await this.prisma.order.findUnique({
      where: { number },
      include: orderInclude,
    });

    if (!order) throw new NotFoundException('No order with that number.');

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

    return paginated(rows, total, query);
  }

  async adminGet(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('That order no longer exists.');
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

      // Cancelling or returning releases the stock back to the shelf.
      if (toStatus === 'CANCELLED' || toStatus === 'RETURNED') {
        for (const item of order.items) {
          if (!item.variantId) continue;
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }
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
      }));

      const stitchingFeeUnit = item.stitchingService
        ? computeStitchingFee({
            baseFee: item.stitchingService.basePrice,
            optionDeltas: options.map((option) => option.priceDelta),
          })
        : 0;

      if (item.stitchingService && !item.measurementProfile) {
        throw new BadRequestException(
          `Add measurements for the stitched ${
            item.stitchingService.garmentType?.labelEn ?? 'garment'
          } before checking out.`,
        );
      }

      const english = pickTranslation(item.product.translations, 'en');
      const urdu = item.product.translations.find((row) => row.locale === 'ur');
      const image =
        item.product.images.find((candidate) => candidate.isPrimary) ??
        item.product.images[0];

      return {
        productId: item.productId,
        variantId: item.variantId,
        kind: item.product.kind,
        nameEn: english?.name ?? item.product.slug,
        nameUr: urdu?.name ?? null,
        sku: item.variant.sku,
        imageUrl: image?.url ?? null,
        variantLabel:
          [item.variant.size, item.variant.color].filter(Boolean).join(' / ') || null,
        unitPrice,
        quantity: item.quantity,
        stitchingFeeUnit,
        lineTotal: (unitPrice + stitchingFeeUnit) * item.quantity,
        stitchingServiceId: item.stitchingServiceId,
        stitchingServiceName: item.stitchingService
          ? (pickTranslation(item.stitchingService.translations, locale)?.name ??
            item.stitchingService.slug)
          : null,
        garmentTypeKey: item.stitchingService?.garmentType?.key ?? null,
        measurementSnapshot: item.measurementProfile
          ? {
              label: item.measurementProfile.label,
              garmentTypeKey: item.measurementProfile.garmentType.key,
              values: item.measurementProfile.values,
            }
          : null,
        optionsSnapshot: options.length > 0 ? options : null,
        stitchingNotes: item.stitchingNotes,
      };
    });

    const totals = computeOrderTotals({
      items: lines.map((line) => ({
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        stitchingFeePerUnit: line.stitchingFeeUnit,
      })),
    });

    return { lines, totals };
  }
}

const cartInclude = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      product: { include: { translations: true, images: true } },
      variant: true,
      stitchingService: { include: { translations: true, garmentType: true } },
      measurementProfile: { include: { garmentType: true } },
      stitchingOptions: { include: { option: { include: { group: true } } } },
    },
  },
} satisfies Prisma.CartInclude;

type CartWithRelations = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

/**
 * Sequential order numbers per year: YSN-2026-0001.
 *
 * Counted inside the placement transaction, so two simultaneous checkouts
 * cannot be handed the same number — the unique index on Order.number is the
 * backstop.
 */
async function nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `YSN-${year}-`;

  const latest = await tx.order.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  const sequence = latest ? Number.parseInt(latest.number.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}
