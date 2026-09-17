import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type OrderPlacedPayload, type PaymentPayload, type PaymentRefundedPayload } from '../../core/events/domain-events';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AccountingService } from './accounting.service';
import { ACCOUNT_CODE } from './chart-of-accounts';

/**
 * Posting rules (RETAIL-ERP.md R15, WO-19.2) — the only place a sale, a
 * receipt or a refund becomes a journal entry. Each handler subscribes to an
 * event `orders`/`payments` already publish for their own reasons; neither
 * module imports this one or knows it exists (R15: "accounting couples to
 * nothing"). Switching `accounting` off in MODULES removes this class from
 * the DI container entirely — nothing posts, nothing breaks.
 *
 * Outbox delivery is at-least-once (`OnDomainEvent`'s own doc), so every
 * handler is idempotent: it looks for an entry already POSTED at the same
 * (source, sourceRef) before writing one, via `AccountingService.findPostedEntry`.
 */
@Injectable()
export class PostingRulesSubscriber {
  private readonly logger = new Logger(PostingRulesSubscriber.name);

  constructor(
    private readonly accounting: AccountingService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Dr Accounts Receivable · Cr Sales Revenue · Cr Tax Payable; Dr COGS ·
   * Cr Inventory — one balanced entry (R15's event table). Always posts to
   * AR rather than branching on payment method: `PaymentSucceeded` is what
   * clears it, uniformly, whether the money arrived by COD or online.
   */
  @OnDomainEvent(DomainEvent.OrderPlaced)
  async onOrderPlaced(payload: OrderPlacedPayload): Promise<void> {
    const source = DomainEvent.OrderPlaced;
    if (await this.accounting.findPostedEntry(source, payload.orderId)) return;

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: {
        grandTotal: true,
        taxAmount: true,
        placedAt: true,
        items: { select: { unitCost: true, quantity: true } },
      },
    });
    if (!order) {
      this.logger.warn(`OrderPlaced fired for ${payload.orderId}, but the order no longer exists — skipped.`);
      return;
    }

    const accountId = await this.accounting.accountIdsByCode([
      ACCOUNT_CODE.ACCOUNTS_RECEIVABLE,
      ACCOUNT_CODE.SALES_REVENUE,
      ACCOUNT_CODE.TAX_PAYABLE,
      ACCOUNT_CODE.INVENTORY,
      ACCOUNT_CODE.COGS,
    ]);
    const ar = accountId.get(ACCOUNT_CODE.ACCOUNTS_RECEIVABLE);
    const revenue = accountId.get(ACCOUNT_CODE.SALES_REVENUE);
    if (!ar || !revenue) {
      this.logger.error(`Chart of accounts is missing AR or Revenue — cannot post the sale for ${payload.orderNumber}.`);
      return;
    }

    const lines = [
      { accountId: ar, debitMinor: order.grandTotal },
      { accountId: revenue, creditMinor: order.grandTotal - order.taxAmount },
    ];

    if (order.taxAmount > 0) {
      const taxPayable = accountId.get(ACCOUNT_CODE.TAX_PAYABLE);
      if (taxPayable) lines.push({ accountId: taxPayable, creditMinor: order.taxAmount });
    }

    const totalCogs = order.items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
    if (totalCogs > 0) {
      const cogs = accountId.get(ACCOUNT_CODE.COGS);
      const inventory = accountId.get(ACCOUNT_CODE.INVENTORY);
      if (cogs && inventory) {
        lines.push({ accountId: cogs, debitMinor: totalCogs });
        lines.push({ accountId: inventory, creditMinor: totalCogs });
      }
    }

    await this.accounting.postEntry({
      date: order.placedAt,
      source,
      sourceRef: payload.orderId,
      memo: `Sale — ${payload.orderNumber}`,
      lines,
    });
  }

  /** Dr Cash & Bank · Cr Accounts Receivable — settles the receivable the sale opened. */
  @OnDomainEvent(DomainEvent.PaymentSucceeded)
  async onPaymentSucceeded(payload: PaymentPayload): Promise<void> {
    const source = DomainEvent.PaymentSucceeded;
    if (payload.amount <= 0) return;
    if (await this.accounting.findPostedEntry(source, payload.paymentId)) return;

    const accountId = await this.accounting.accountIdsByCode([
      ACCOUNT_CODE.CASH_AND_BANK,
      ACCOUNT_CODE.ACCOUNTS_RECEIVABLE,
    ]);
    const bank = accountId.get(ACCOUNT_CODE.CASH_AND_BANK);
    const ar = accountId.get(ACCOUNT_CODE.ACCOUNTS_RECEIVABLE);
    if (!bank || !ar) {
      this.logger.error(`Chart of accounts is missing Cash & Bank or AR — cannot post the receipt for payment ${payload.paymentId}.`);
      return;
    }

    await this.accounting.postEntry({
      date: new Date(),
      source,
      sourceRef: payload.paymentId,
      memo: `Receipt — ${payload.provider}`,
      lines: [
        { accountId: bank, debitMinor: payload.amount },
        { accountId: ar, creditMinor: payload.amount },
      ],
    });
  }

  /**
   * A refund reverses what it undoes, never edits it (R15): the receipt this
   * payment posted, and the sale itself, so revenue, tax and COGS unwind
   * together. There is no partial-refund workflow in this codebase yet
   * (`Payment.refundAmount` exists but nothing sets it to less than the full
   * amount), so a full reversal of both entries is the correct read of
   * today's domain model, not an approximation of one that isn't built.
   */
  @OnDomainEvent(DomainEvent.PaymentRefunded)
  async onPaymentRefunded(payload: PaymentRefundedPayload): Promise<void> {
    const receipt = await this.accounting.findPostedEntry(DomainEvent.PaymentSucceeded, payload.paymentId);
    if (receipt) await this.accounting.reverseEntry(receipt.id, `Refund — payment ${payload.paymentId}`);

    const sale = await this.accounting.findPostedEntry(DomainEvent.OrderPlaced, payload.orderId);
    if (sale) await this.accounting.reverseEntry(sale.id, `Refund — order ${payload.orderId}`);

    if (!receipt && !sale) {
      this.logger.warn(
        `PaymentRefunded fired for payment ${payload.paymentId}, but neither its receipt nor its sale ` +
          'entry is POSTED — nothing to reverse (already reversed, or the ledger was off when it posted).',
      );
    }
  }
}
