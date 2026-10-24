import { BadRequestException, ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { computeOrderTotals } from '@newax/shared';
import { AppConfigService } from '../../../core/config/app-config.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { EventBusService } from '../../../core/events/event-bus.service';
import {
  AuctionInvoiceRejectedError,
  AuctionOrderSinkRegistry,
  type AuctionInvoice,
  type AuctionInvoiceRequest,
  type AuctionOrderSink,
} from '../../../core/extension-points/auction-order-sink.registry';
import { Prisma } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { PaymentsService } from '../payments/payments.service';
import { nextOrderNumber, OrdersService } from './orders.service';

/** An order's money columns are 32-bit integers (minor units). Past this the order cannot be made. */
export const MAX_ORDER_MINOR = 2_147_483_647;

/**
 * Makes `orders` the thing an auction asks for an invoice (doc 234 §9, §10): an
 * order for one winner, `PENDING`, with a payment row for the method the shop
 * chose, exactly as a checkout order is left. It registers itself at boot so
 * the auction never imports this module.
 *
 * Its two calls are idempotent. `invoice` is keyed on `(sourceType, sourceRef)`,
 * which `Order` holds unique, so a retry after a crash yields the first order;
 * `cancel` on an order already cancelled does nothing.
 */
@Injectable()
export class AuctionOrderSinkService implements AuctionOrderSink, OnModuleInit {
  private readonly logger = new Logger(AuctionOrderSinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly events: EventBusService,
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
    private readonly registry: AuctionOrderSinkRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async invoice(request: AuctionInvoiceRequest): Promise<AuctionInvoice> {
    const existing = await this.findBySource(request.sourceType, request.sourceRef);
    if (existing) return existing;

    const lines = request.lines.filter((line) => line.amountMinor > 0);
    if (lines.some((line) => !Number.isSafeInteger(line.amountMinor))) {
      throw new AuctionInvoiceRejectedError('NOTHING_TO_INVOICE', 'An amount on this invoice is not a whole number of minor units.');
    }
    const total = lines.reduce((sum, line) => sum + line.amountMinor, 0);
    if (total <= 0) throw new AuctionInvoiceRejectedError('NOTHING_TO_INVOICE', 'There is nothing to invoice: the amount is zero.');
    if (total > MAX_ORDER_MINOR) {
      throw new AuctionInvoiceRejectedError(
        'ABOVE_ORDER_LIMIT',
        `This win is ${total} minor units, above the ${MAX_ORDER_MINOR} an order can hold. Invoice it outside the system.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: request.userId },
      select: { id: true, email: true, phone: true, firstName: true, lastName: true },
    });
    if (!user) throw new AuctionInvoiceRejectedError('NO_SUCH_CUSTOMER', 'The winner no longer has an account to invoice.');
    const customerName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Customer';

    try {
      this.payments.get(request.paymentMethod);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new AuctionInvoiceRejectedError(
          'PAYMENT_METHOD_UNAVAILABLE',
          `The payment method "${request.paymentMethod}" is not switched on. Change "Payment method for auction winners" in Settings, or switch the method on, then replay.`,
        );
      }
      throw error;
    }

    const totals = computeOrderTotals({
      items: lines.map((line) => ({ unitPrice: line.amountMinor, quantity: 1 })),
      shippingFee: 0,
      codFee: 0,
      taxAmount: 0,
    });
    const orderNumber = await nextOrderNumber(this.prisma, this.settings, this.config);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            number: orderNumber,
            userId: user.id,
            status: 'PENDING',
            channel: 'WEB',
            currency: request.currency,
            sourceType: request.sourceType,
            sourceRef: request.sourceRef,
            shippingAddress: {},
            itemsSubtotal: totals.itemsSubtotal,
            stitchingSubtotal: totals.stitchingSubtotal,
            itemDiscountTotal: totals.itemDiscountTotal,
            orderDiscount: totals.orderDiscount,
            shippingFee: totals.shippingFee,
            codFee: totals.codFee,
            taxAmount: totals.taxAmount,
            grandTotal: totals.grandTotal,
            staffNote: request.note ?? null,
            items: {
              create: lines.map((line) => ({
                kind: line.kind,
                nameEn: line.name,
                unitPrice: line.amountMinor,
                quantity: 1,
                lineTotal: line.amountMinor,
              })),
            },
            statusEvents: { create: { toStatus: 'PENDING', note: request.note ?? 'Invoice for an auction win', actorId: null } },
          },
          select: { id: true, number: true, grandTotal: true, placedAt: true },
        });

        await this.payments.createForOrder(tx, request.paymentMethod, {
          orderId: order.id,
          orderNumber: order.number,
          amount: order.grandTotal,
          customerName,
          customerPhone: user.phone,
          customerEmail: user.email,
        });

        await this.events.publish(
          DomainEvent.OrderPlaced,
          {
            orderId: order.id,
            orderNumber: order.number,
            userId: user.id,
            customerName,
            customerPhone: user.phone,
            customerEmail: user.email,
            grandTotal: order.grandTotal,
            placedAt: order.placedAt.toISOString(),
            stitchingItemIds: [],
          },
          tx,
        );
        return order;
      });
      this.logger.log(`Invoiced ${request.sourceType} ${request.sourceRef} as order ${created.number} (${created.grandTotal} minor units)`);
      return { orderId: created.id, orderNumber: created.number, totalMinor: created.grandTotal };
    } catch (error) {
      // Two callers asked for the same source at once and the other one won: that order is the answer.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.findBySource(request.sourceType, request.sourceRef);
        if (winner) return winner;
      }
      throw error;
    }
  }

  async cancel(orderId: string, reason: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, status: true } });
    if (!order || order.status === 'CANCELLED') return;
    const paid = await this.prisma.payment.count({ where: { orderId, status: 'PAID' } });
    if (paid > 0) {
      throw new ConflictException('This order has been paid, so it cannot be cancelled from here. Refund it from the order.');
    }
    await this.orders.changeStatus(null, orderId, 'CANCELLED', reason);
    // A transfer still waiting for approval must not be approvable against a cancelled order.
    await this.prisma.payment.updateMany({
      where: { orderId, status: { in: ['PENDING', 'AWAITING_APPROVAL'] } },
      data: { status: 'CANCELLED' },
    });
  }

  private async findBySource(sourceType: string, sourceRef: string): Promise<AuctionInvoice | null> {
    const found = await this.prisma.order.findFirst({
      where: { sourceType, sourceRef },
      select: { id: true, number: true, grandTotal: true },
    });
    return found ? { orderId: found.id, orderNumber: found.number, totalMinor: found.grandTotal } : null;
  }
}
