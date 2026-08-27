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
import { Prisma, type OrderStatus } from '../../core/prisma/client';
import { stitchingFeeFor } from '../cart/cart.service';
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
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      // The tailoring progress for a stitched line, so the customer's order page
      // shows the same stage rail as a standalone booking. Read-only, and only
      // the fields the timeline draws — the workshop's notes and photographs
      // belong to the stitching module's own screens.
      stitchingJob: {
        select: {
          number: true,
          stage: true,
          dueAt: true,
          events: {
            select: { fromStage: true, toStage: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  },
  payments: { orderBy: { createdAt: 'desc' } },
  shipments: { orderBy: { createdAt: 'desc' } },
  statusEvents: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
    private readonly inventory: InventoryService,
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

      const sortedLines = [...priced.lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
      for (const line of sortedLines) {
        try {
          await this.inventory.move({
            variantId: line.variantId,
            delta: -line.quantity,
            reason: 'SALE',
            refType: 'Order',
            refId: created.id,
          }, tx);
        } catch (error) {
          if (error instanceof BadRequestException && error.message.includes('take it negative')) {
             throw new BadRequestException(`${line.nameEn} sold out while you were checking out. Please adjust your cart.`);
          }
          throw error;
        }
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
        const moveReason = toStatus === 'CANCELLED' ? 'CANCELLATION' : 'RETURN';
        await this.inventory.moveMany(
          order.items.filter(i => i.variantId).map(item => ({
            variantId: item.variantId!,
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

      const stitchingFeeUnit = stitchingFeeFor(
        item,
        options.map((option) => option.priceDelta),
      );

      if (item.garmentTypeId && !item.measurementProfile && !item.measurementValues) {
        throw new BadRequestException(
          `Add measurements for the stitched ${
            item.garmentType?.labelEn ?? 'garment'
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
        garmentTypeKey: item.garmentType?.key ?? null,
        measurementSnapshot: measurementSnapshotFor(item),
        optionsSnapshot:
          options.length + described.length > 0 ? [...options, ...described] : null,
        stitchingNotes: item.stitchingNotes,
        measurementValues: item.measurementValues,
        customDesignText: item.customDesignText,
        sizeToken: item.sizeToken,
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
      garmentType: true,
      stitchingService: { include: { translations: true, garmentType: true } },
      measurementProfile: { include: { garmentType: true } },
      stitchingOptions: { include: { option: { include: { group: true } } } },
    },
  },
} satisfies Prisma.CartInclude;

type CartWithRelations = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

/**
 * The measurements the workshop will cut to.
 *
 * A saved profile and an inline entry are the same thing to a tailor, so both
 * collapse into one shape here and the job sheet never has to know which door
 * the numbers came in through.
 */
function measurementSnapshotFor(item: CartWithRelations['items'][number]) {
  if (item.measurementProfile) {
    return {
      label: item.measurementProfile.label,
      garmentTypeKey: item.measurementProfile.garmentType.key,
      values: item.measurementProfile.values,
    };
  }

  if (item.measurementValues) {
    return {
      label: null,
      garmentTypeKey: item.garmentType?.key ?? null,
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
 * Namespace for the advisory lock below — an arbitrary constant that only has
 * to be distinct from any other advisory lock this application takes.
 */
const ORDER_NUMBER_LOCK_NAMESPACE = 8_241_119;

/**
 * Sequential order numbers per year: YSN-2026-0001.
 *
 * Reading the highest number and adding one is a read-then-write, and READ
 * COMMITTED (Postgres' default, and Prisma's) takes no lock on that read — so
 * concurrent checkouts used to compute the same next number and all but one
 * died on Order.number's unique index. That surfaced to the customer as a 409
 * at the moment of payment; a burst of 8 simultaneous checkouts lost 6.
 *
 * A transaction-scoped advisory lock serialises just this counter. It is
 * released automatically when the placement transaction commits or rolls back,
 * and it is per-year, so it never blocks anything else. The unique index stays
 * as the backstop it was always described as.
 *
 * MAX() over the numeric suffix rather than `ORDER BY number DESC`: the string
 * sort silently breaks once the sequence outgrows its four-digit padding,
 * where 'YSN-2026-9999' sorts above 'YSN-2026-10000' and every subsequent
 * order would be handed a number that already exists.
 */
async function nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `YSN-${year}-`;

  // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void, which
  // Prisma cannot deserialise as a result column.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ORDER_NUMBER_LOCK_NAMESPACE}::int, ${year}::int)`;

  // split_part over SUBSTRING: the offset would be bound as a bigint, and
  // there is no substring(text, bigint). "YSN-2026-0001" splits to 3 parts,
  // the last being the sequence.
  const [{ max }] = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(split_part("number", '-', 3) AS INTEGER)) AS max
    FROM "Order"
    WHERE "number" LIKE ${`${prefix}%`}
  `;

  return `${prefix}${String((max ?? 0) + 1).padStart(4, '0')}`;
}
