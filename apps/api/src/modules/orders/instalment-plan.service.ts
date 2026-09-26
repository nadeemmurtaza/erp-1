import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { DomainEvent } from '../../core/events/domain-events';
import { AuditService } from '../../core/audit/audit.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { InventoryService, InsufficientStockError } from '../inventory/inventory.service';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from './orders.service';

/**
 * Layby and instalment sales (finance-accounting/151-layby-installment-sales.md).
 * Lives inside `orders` (which already hard-imports `payments`/`inventory` —
 * see orders.module.ts's own comment) rather than a new module: this is a
 * variant of the order/payment lifecycle, not a separate business domain.
 * Every payment is an ordinary `Payment` row created the identical way
 * `OrdersService.placeFromPos()`'s own cash tender already is — never a
 * second payment-recording mechanism.
 */
@Injectable()
export class InstalmentPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly inventory: InventoryService,
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
  ) {}

  async getPlan(orderId: string) {
    const plan = await this.prisma.instalmentPlan.findUnique({
      where: { orderId },
      include: {
        schedule: { orderBy: { dueDate: 'asc' } },
        payments: { include: { payment: true }, orderBy: { receivedAt: 'asc' } },
      },
    });
    if (!plan) throw new NotFoundException('This order has no instalment plan.');
    return plan;
  }

  private paidSoFar(plan: { payments: { payment: { amount: number } }[] }): number {
    return plan.payments.reduce((sum, p) => sum + p.payment.amount, 0);
  }

  /**
   * Records one instalment payment through an ordinary `Payment` row —
   * never assumed to match the schedule exactly (a customer paying early,
   * late, or a different amount than scheduled is normal). Refuses an
   * overpayment outright rather than silently accepting a mismatched
   * amount (WO-151's own acceptance criterion).
   *
   * The payment itself is a RECORD once validated — it always commits. What
   * follows for a completed LAYBY (releasing stock, advancing the order) is
   * a separate REQUEST that can fail independently (the shelf may no
   * longer hold the goods — an unpaid layby reserves nothing, a deliberate
   * trade-off doc 151 names explicitly): a stock failure there never rolls
   * back the payment that was, in fact, received.
   */
  async recordInstalmentPayment(actorId: string, orderId: string, amountMinor: number, provider: string) {
    if (amountMinor <= 0) throw new BadRequestException('amountMinor must be positive.');

    const plan = await this.prisma.instalmentPlan.findUnique({
      where: { orderId },
      include: { payments: { include: { payment: true } } },
    });
    if (!plan) throw new NotFoundException('This order has no instalment plan.');
    if (plan.status !== 'ACTIVE') {
      throw new BadRequestException(`This plan is ${plan.status}, not ACTIVE — no more payments can be recorded.`);
    }

    const remaining = plan.totalMinor - this.paidSoFar(plan);
    if (amountMinor > remaining) {
      throw new BadRequestException(
        `This would overpay the plan — ${remaining} paisa remaining, ${amountMinor} paisa submitted.`,
      );
    }
    const willComplete = amountMinor === remaining;

    const { payment } = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: { orderId, provider, amount: amountMinor, status: 'PAID', paidAt: new Date() },
      });
      await tx.instalmentPayment.create({ data: { planId: plan.id, paymentId: payment.id } });

      await this.events.publish(
        DomainEvent.PaymentSucceeded,
        { paymentId: payment.id, orderId, provider, amount: amountMinor, status: 'PAID' },
        tx,
      );

      if (willComplete) {
        await tx.instalmentPlan.update({ where: { id: plan.id }, data: { status: 'COMPLETED' } });
      }
      return { payment };
    });

    await this.audit.record({
      actorId,
      action: 'instalment.payment_recorded',
      entity: 'InstalmentPlan',
      entityId: plan.id,
      data: { orderId, amountMinor, remainingAfter: remaining - amountMinor },
    });

    let fulfilmentError: string | null = null;
    if (willComplete && plan.type === 'LAYBY') {
      fulfilmentError = await this.releaseLaybyStock(actorId, orderId);
    }

    return { payment, planStatus: willComplete ? 'COMPLETED' : 'ACTIVE', fulfilmentError };
  }

  /**
   * The one place a LAYBY order's stock is actually decremented — through
   * the CHECKED `InventoryService.move()`, never `postUnconditional()`: an
   * unpaid layby reserved nothing, so the shelf may genuinely no longer
   * hold the goods by the time it is paid off, and that must be visible,
   * never silently oversold. On success, advances the order past PENDING —
   * the first real status move a LAYBY order makes, per doc 151's own
   * fulfilment-gate design. Returns a message (never throws) so the caller
   * — payment recording above — can report "paid in full, but stock is
   * unavailable" without losing the payment it already committed.
   */
  private async releaseLaybyStock(actorId: string, orderId: string): Promise<string | null> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || !order.locationId) return 'This order has no location to release stock from.';

    try {
      await this.prisma.$transaction(async (tx) => {
        const sortedItems = [...order.items].sort((a, b) => (a.variantId ?? '').localeCompare(b.variantId ?? ''));
        for (const item of sortedItems) {
          if (!item.variantId) continue;
          await this.inventory.move(
            {
              variantId: item.variantId,
              locationId: order.locationId!,
              delta: -item.quantity,
              reason: 'POS_SALE',
              refType: 'Order',
              refId: order.id,
              unitCost: item.unitCost,
              actorId,
            },
            tx,
          );
        }
      });
    } catch (cause) {
      return cause instanceof InsufficientStockError
        ? `Paid in full, but stock is no longer available: ${cause.message}`
        : 'Paid in full, but releasing stock failed — resolve manually.';
    }

    await this.orders.changeStatus(actorId, orderId, 'CONFIRMED', 'Layby paid in full — stock released');
    return null;
  }

  /**
   * Cancels an ACTIVE plan. The deposit-forfeiture policy (a `Setting`,
   * never a hardcoded rule) decides whether the deposit specifically is
   * kept or refunded through the existing `PaymentsService.refund()` path
   * — every later instalment payment is untouched either way, since only
   * the deposit was ever the client's own stated forfeiture policy.
   */
  async cancel(actorId: string, orderId: string) {
    const plan = await this.prisma.instalmentPlan.findUnique({
      where: { orderId },
      include: { payments: { include: { payment: true } } },
    });
    if (!plan) throw new NotFoundException('This order has no instalment plan.');
    if (plan.status !== 'ACTIVE') {
      throw new BadRequestException(`This plan is ${plan.status}, not ACTIVE — only an active plan can be cancelled.`);
    }

    const forfeit = await this.settings.get<boolean>(SettingKey.PosInstalmentForfeitDepositOnCancel);
    const depositLink = plan.payments.find((p) => p.isDeposit);

    let depositRefunded = false;
    if (depositLink && !forfeit && depositLink.payment.status === 'PAID') {
      await this.payments.refund(actorId, depositLink.paymentId, undefined, 'Layby plan cancelled');
      depositRefunded = true;
    }

    await this.prisma.instalmentPlan.update({
      where: { id: plan.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    await this.audit.record({
      actorId,
      action: 'instalment.plan_cancelled',
      entity: 'InstalmentPlan',
      entityId: plan.id,
      data: { orderId, depositForfeited: Boolean(depositLink) && !depositRefunded, depositRefunded },
    });

    return { depositRefunded, depositForfeited: Boolean(depositLink) && !depositRefunded };
  }

  /** Writes off the unpaid balance — the plan's own status, nothing more (doc 151's own "undo fan-out": stock was never reserved, so there is nothing on the inventory side to undo). */
  async markDefaulted(actorId: string, orderId: string) {
    const plan = await this.prisma.instalmentPlan.findUnique({ where: { orderId } });
    if (!plan) throw new NotFoundException('This order has no instalment plan.');
    if (plan.status !== 'ACTIVE') {
      throw new BadRequestException(`This plan is ${plan.status}, not ACTIVE — only an active plan can default.`);
    }

    const updated = await this.prisma.instalmentPlan.update({
      where: { id: plan.id },
      data: { status: 'DEFAULTED', defaultedAt: new Date() },
    });

    await this.audit.record({
      actorId,
      action: 'instalment.plan_defaulted',
      entity: 'InstalmentPlan',
      entityId: plan.id,
      data: { orderId },
    });

    return updated;
  }
}
