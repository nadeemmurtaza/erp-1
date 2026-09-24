import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppConfigService } from '../../core/config/app-config.service';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService, type PrismaLike } from '../../core/events/event-bus.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import type { Prisma } from '../../core/prisma/client';
import { BankTransferProvider } from './providers/bank-transfer.provider';
import { CodProvider } from './providers/cod.provider';
import { EasypaisaProvider } from './providers/easypaisa.provider';
import { GiftkartaProvider } from './providers/giftkarta.provider';
import { JazzCashProvider } from './providers/jazzcash.provider';
import type { PaymentCallbackResult, PaymentContext, PaymentProvider } from './payment-provider';

/**
 * Payments, behind one interface.
 *
 * Which providers exist is decided by the PAYMENT_PROVIDERS allowlist, so
 * turning JazzCash on when the merchant account is approved is an env change.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    config: AppConfigService,
    cod: CodProvider,
    bankTransfer: BankTransferProvider,
    jazzCash: JazzCashProvider,
    easypaisa: EasypaisaProvider,
    giftkarta: GiftkartaProvider,
  ) {
    for (const provider of [cod, bankTransfer, jazzCash, easypaisa, giftkarta]) {
      if (config.isPaymentProviderEnabled(provider.key)) {
        this.providers.set(provider.key, provider);
      }
    }

    if (this.providers.size === 0) {
      this.logger.error('No payment providers are enabled — checkout cannot complete.');
    } else {
      this.logger.log(`Payment providers: ${[...this.providers.keys()].join(', ')}`);
    }
  }

  /** What the checkout page offers. */
  async listAvailable() {
    return Promise.all(
      [...this.providers.values()].map(async (provider) => ({
        key: provider.key,
        labelEn: provider.labelEn,
        labelUr: provider.labelUr,
        descriptionEn: provider.descriptionEn,
        descriptionUr: provider.descriptionUr,
        fee: await provider.feeFor(0),
        requiresCode: provider.requiresCode ?? false,
      })),
    );
  }

  get(key: string): PaymentProvider {
    const provider = this.providers.get(key);
    if (!provider) {
      throw new BadRequestException(
        `"${key}" is not an available payment method. Choose one of: ${[...this.providers.keys()].join(', ')}.`,
      );
    }
    return provider;
  }

  /** The extra charge for a method — the COD collection fee, or zero. */
  async feeFor(key: string, amount: number): Promise<number> {
    return this.get(key).feeFor(amount);
  }

  /**
   * Creates the payment row alongside the order.
   *
   * Takes the transaction client so the payment and the order are written
   * together — an order without its payment record would be invisible to
   * reconciliation.
   */
  async createForOrder(
    tx: PrismaLike,
    providerKey: string,
    context: PaymentContext,
  ): Promise<{ paymentId: string; redirectUrl: string | null; meta?: unknown }> {
    const provider = this.get(providerKey);
    const initiation = await provider.initiate(context);

    const payment = await tx.payment.create({
      data: {
        orderId: context.orderId,
        provider: provider.key,
        status: initiation.status,
        amount: context.amount,
        reference: initiation.reference,
        meta: (initiation.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    if (initiation.status === 'AWAITING_APPROVAL') {
      await this.events.publish(
        DomainEvent.PaymentAwaitingApproval,
        {
          paymentId: payment.id,
          orderId: context.orderId,
          provider: provider.key,
          amount: context.amount,
          status: initiation.status,
        },
        tx,
      );
    }

    return {
      paymentId: payment.id,
      redirectUrl: initiation.redirectUrl,
      meta: initiation.meta,
    };
  }

  /** Handles a gateway's return, marking the payment and order accordingly. */
  async handleCallback(providerKey: string, payload: Record<string, unknown>) {
    const provider = this.get(providerKey);

    if (!provider.handleCallback) {
      throw new BadRequestException(`${provider.key} does not use a payment callback.`);
    }

    const result = await provider.handleCallback(payload);

    // A response that could not be proved to come from the gateway changes
    // nothing at all — not to PAID, and not to FAILED either.
    if (result.verified === false) {
      throw new ForbiddenException('That payment response could not be verified.');
    }

    // Scoped to the provider whose endpoint was called, not just the
    // reference. References are unique shop-wide, so without this a callback
    // for one gateway can settle a payment taken through another — a forged
    // Easypaisa return was able to mark a bank transfer PAID.
    const payment = await this.prisma.payment.findFirst({
      where: { reference: result.reference, provider: provider.key },
      // The web app's callback route redirects the customer to their order
      // page and needs its human-facing number for that URL — it only has
      // this gateway's raw return payload to work from, not the order's id.
      include: { order: { select: { number: true } } },
    });

    if (!payment) {
      throw new NotFoundException(`No payment for reference ${result.reference}.`);
    }
    // Callbacks can arrive twice; the first one wins.
    if (payment.status === 'PAID') {
      return { orderId: payment.orderId, orderNumber: payment.order.number, status: payment.status };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: result.status,
          providerRef: result.providerRef ?? null,
          failureReason: result.failureReason ?? null,
          paidAt: result.status === 'PAID' ? new Date() : null,
          meta: result.raw as Prisma.InputJsonValue,
        },
      });

      if (result.status === 'PAID') {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        });
      }

      await this.events.publish(
        result.status === 'PAID' ? DomainEvent.PaymentSucceeded : DomainEvent.PaymentFailed,
        {
          paymentId: payment.id,
          orderId: payment.orderId,
          provider: provider.key,
          amount: payment.amount,
          status: result.status,
        },
        tx,
      );
    });

    return { orderId: payment.orderId, orderNumber: payment.order.number, status: result.status };
  }

  /** Attaches a bank-transfer receipt to a payment awaiting approval. */
  async attachReceipt(
    paymentId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('That payment no longer exists.');

    if (payment.status === 'PAID') {
      throw new BadRequestException('This payment has already been confirmed.');
    }

    const stored = await this.storage.putImage({
      folder: 'payment-receipts',
      filename: file.originalname,
      contentType: file.mimetype,
      body: file.buffer,
    });

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { receiptUrl: stored.url, status: 'AWAITING_APPROVAL' },
    });
  }

  /**
   * A customer submitting a third-party gift card's own code — Giftkarta's
   * `requiresCode` flow (payment-provider.ts's own doc comment on
   * `redeemCode`). Deliberately outside any transaction until the provider
   * has answered: the external redeem call is a real, non-reversible side
   * effect Postgres cannot roll back, so it must never sit inside a wider
   * transaction that could still fail for an unrelated reason. Same
   * settlement shape as handleCallback() above (update the payment, confirm
   * the order, publish the matching event) — kept separate rather than
   * merged with it because this is driven by a customer-submitted code
   * against ONE named payment, not an inbound webhook matched by reference.
   */
  async redeemGiftCardCode(paymentId: string, code: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { id: true, number: true, guestName: true, guestPhone: true, guestEmail: true } } },
    });
    if (!payment) throw new NotFoundException('That payment no longer exists.');

    const provider = this.get(payment.provider);
    if (!provider.requiresCode || !provider.redeemCode) {
      throw new BadRequestException(`${provider.key} does not take a gift card code.`);
    }

    // Idempotent the same way attachReceipt/approve already are: a retried
    // submission (a flaky connection, the customer double-tapping) against an
    // already-settled payment changes nothing.
    if (payment.status === 'PAID') {
      return { orderId: payment.orderId, orderNumber: payment.order.number, status: payment.status };
    }

    const context: PaymentContext = {
      orderId: payment.order.id,
      orderNumber: payment.order.number,
      amount: payment.amount,
      customerName: payment.order.guestName ?? '',
      customerPhone: payment.order.guestPhone,
      customerEmail: payment.order.guestEmail,
    };

    const result: PaymentCallbackResult = await provider.redeemCode(context, code);

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: result.status,
          providerRef: result.providerRef ?? null,
          failureReason: result.failureReason ?? null,
          paidAt: result.status === 'PAID' ? new Date() : null,
          meta: result.raw as Prisma.InputJsonValue,
        },
      });

      if (result.status === 'PAID') {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        });
      }

      await this.events.publish(
        result.status === 'PAID' ? DomainEvent.PaymentSucceeded : DomainEvent.PaymentFailed,
        {
          paymentId: payment.id,
          orderId: payment.orderId,
          provider: provider.key,
          amount: payment.amount,
          status: result.status,
        },
        tx,
      );
    });

    if (result.status === 'FAILED') {
      throw new BadRequestException(result.failureReason ?? 'That gift card could not be redeemed.');
    }

    return { orderId: payment.orderId, orderNumber: payment.order.number, status: result.status };
  }

  /** Staff confirming a bank transfer, or cash collected on delivery. */
  async approve(actorId: string, paymentId: string, note?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('That payment no longer exists.');

    if (payment.status === 'PAID') {
      throw new BadRequestException('This payment is already marked paid.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          approvedById: actorId,
          meta: { ...(payment.meta as object | null), approvalNote: note ?? null } as Prisma.InputJsonValue,
        },
      });

      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
      if (order.status === 'PENDING') {
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        });
      }

      await this.events.publish(
        DomainEvent.PaymentSucceeded,
        {
          paymentId,
          orderId: payment.orderId,
          provider: payment.provider,
          amount: payment.amount,
          status: 'PAID',
        },
        tx,
      );

      return result;
    });

    await this.audit.record({
      actorId,
      action: 'payment.approved',
      entity: 'Payment',
      entityId: paymentId,
      data: { provider: payment.provider, amount: payment.amount },
    });

    return updated;
  }

  /**
   * Staff marking a payment refunded — a full refund unless `amount` gives a
   * partial one. This only records that the money went back and notifies the
   * customer; moving the money itself (a bank transfer, a gateway refund
   * call, cash handed back) is a manual step staff take outside this system,
   * same as bank-transfer approval already is.
   */
  async refund(actorId: string, paymentId: string, amount?: number, note?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('That payment no longer exists.');

    if (payment.status !== 'PAID') {
      throw new BadRequestException('Only a paid payment can be refunded.');
    }

    const refundAmount = amount ?? payment.amount;
    if (refundAmount <= 0 || refundAmount > payment.amount) {
      throw new BadRequestException(
        `Refund amount must be between 1 and ${payment.amount} (the amount paid).`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
          refundAmount,
          meta: { ...(payment.meta as object | null), refundNote: note ?? null } as Prisma.InputJsonValue,
        },
      });

      await this.events.publish(
        DomainEvent.PaymentRefunded,
        {
          paymentId,
          orderId: payment.orderId,
          provider: payment.provider,
          amount: refundAmount,
        },
        tx,
      );

      return result;
    });

    await this.audit.record({
      actorId,
      action: 'payment.refunded',
      entity: 'Payment',
      entityId: paymentId,
      data: { provider: payment.provider, amount: refundAmount },
    });

    return updated;
  }

  /** Payments needing a human decision — the dashboard's approval queue. */
  async listAwaitingApproval() {
    return this.prisma.payment.findMany({
      where: { status: 'AWAITING_APPROVAL' },
      orderBy: { createdAt: 'asc' },
      include: {
        order: {
          select: { id: true, number: true, guestName: true, grandTotal: true, placedAt: true },
        },
      },
    });
  }
}
