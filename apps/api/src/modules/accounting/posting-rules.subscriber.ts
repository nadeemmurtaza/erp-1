import { Injectable, Logger } from '@nestjs/common';
import { convertToBase } from '@newax/shared';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import {
  DomainEvent,
  type OrderPlacedPayload,
  type PaymentPayload,
  type PaymentRefundedPayload,
  type SupplierBillRaisedPayload,
  type SupplierBillPaidPayload,
  type StockVarianceRecordedPayload,
  type InterBranchTransferInvoicedPayload,
  type ExpenseRecordedPayload,
} from '../../core/events/domain-events';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AccountingService, type PostLineInput } from './accounting.service';
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
        contactId: true,
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

    // contactId tags the AR line for Aged Receivables (WO-19.4) to group by
    // customer — null for a guest order, which ages in its own "no contact"
    // bucket rather than being silently dropped from the report.
    const lines: PostLineInput[] = [
      { accountId: ar, debitMinor: order.grandTotal, contactId: order.contactId },
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

  /**
   * Dr Inventory · Cr Accounts Payable, at the bill's own `baseAmountMinor`
   * (already converted by `PurchasingService.createSupplierBill` — this
   * handler never re-derives the conversion, House Rule 11's "written
   * once"). No Goods-Received-Not-Invoiced clearing account yet: nothing
   * posts a matching GRNI entry for `GoodsReceived` today, so introducing
   * one here would leave a balance nothing ever nets to zero.
   */
  @OnDomainEvent(DomainEvent.SupplierBillRaised)
  async onSupplierBillRaised(payload: SupplierBillRaisedPayload): Promise<void> {
    const source = DomainEvent.SupplierBillRaised;
    if (await this.accounting.findPostedEntry(source, payload.billId)) return;
    if (payload.baseAmountMinor <= 0) return;

    const accountId = await this.accounting.accountIdsByCode([ACCOUNT_CODE.INVENTORY, ACCOUNT_CODE.ACCOUNTS_PAYABLE]);
    const inventory = accountId.get(ACCOUNT_CODE.INVENTORY);
    const ap = accountId.get(ACCOUNT_CODE.ACCOUNTS_PAYABLE);
    if (!inventory || !ap) {
      this.logger.error(`Chart of accounts is missing Inventory or Accounts Payable — cannot post the bill ${payload.billId}.`);
      return;
    }

    await this.accounting.postEntry({
      date: new Date(payload.issuedAt),
      source,
      sourceRef: payload.billId,
      memo: `Supplier bill — ${payload.currency} ${payload.amountMinor}`,
      // supplierId tags this origination for Aged Payables (WO-19.4) to
      // group and FIFO-match against this same supplier's payment lines.
      lines: [
        { accountId: inventory, debitMinor: payload.baseAmountMinor },
        {
          accountId: ap,
          creditMinor: payload.baseAmountMinor,
          currency: payload.currency,
          fxRateScaled: payload.fxRateScaled,
          baseAmountMinor: payload.baseAmountMinor,
          supplierId: payload.supplierId,
        },
      ],
    });
  }

  /**
   * Dr Accounts Payable (at the bill's own booked rate) · Cr Cash & Bank (at
   * the settlement rate actually paid) — the difference, if any, is the
   * realised FX gain/loss (R16): paying more base currency than was booked
   * is a loss, paying less is a gain. Both amounts are computed here with
   * the same `convertToBase` every other conversion in this codebase uses
   * (House Rule 11), never a bespoke calculation.
   *
   * Idempotency keys on `${billId}:${paidAt}` rather than a payment id —
   * `SupplierBill` has no per-payment row yet (only a running `amountPaid`);
   * this is the stable, redelivery-safe key available today. Aged Payables
   * (WO-19.4) does not need a separate payment ledger either — it FIFO-
   * matches this line against the bill's own origination line, both tagged
   * `supplierId`, directly off the AP account's JournalLine trail.
   */
  @OnDomainEvent(DomainEvent.SupplierBillPaid)
  async onSupplierBillPaid(payload: SupplierBillPaidPayload): Promise<void> {
    const source = DomainEvent.SupplierBillPaid;
    const sourceRef = `${payload.billId}:${payload.paidAt}`;
    if (payload.amountMinor <= 0) return;
    if (await this.accounting.findPostedEntry(source, sourceRef)) return;

    const accountId = await this.accounting.accountIdsByCode([
      ACCOUNT_CODE.ACCOUNTS_PAYABLE,
      ACCOUNT_CODE.CASH_AND_BANK,
      ACCOUNT_CODE.FX_GAIN,
      ACCOUNT_CODE.FX_LOSS,
    ]);
    const ap = accountId.get(ACCOUNT_CODE.ACCOUNTS_PAYABLE);
    const bank = accountId.get(ACCOUNT_CODE.CASH_AND_BANK);
    if (!ap || !bank) {
      this.logger.error(`Chart of accounts is missing Accounts Payable or Cash & Bank — cannot post the payment for bill ${payload.billId}.`);
      return;
    }

    const bookedBase = convertToBase(payload.amountMinor, payload.billFxRateScaled);
    const paidBase = convertToBase(payload.amountMinor, payload.settlementFxRateScaled);
    const diff = paidBase - bookedBase;

    const lines: PostLineInput[] = [
      { accountId: ap, debitMinor: bookedBase, supplierId: payload.supplierId },
      { accountId: bank, creditMinor: paidBase },
    ];

    if (diff > 0) {
      const fxLoss = accountId.get(ACCOUNT_CODE.FX_LOSS);
      if (fxLoss) lines.push({ accountId: fxLoss, debitMinor: diff });
    } else if (diff < 0) {
      const fxGain = accountId.get(ACCOUNT_CODE.FX_GAIN);
      if (fxGain) lines.push({ accountId: fxGain, creditMinor: -diff });
    }

    await this.accounting.postEntry({
      date: new Date(payload.paidAt),
      source,
      sourceRef,
      memo: `Payment on supplier bill ${payload.billId}`,
      lines,
    });
  }

  /**
   * Dr Inventory Shrinkage · Cr Inventory — R15's shrinkage journal for an
   * oversell InventoryService.postUnconditional() let through (R5). No
   * reversal path: a variance is resolved by a manager (StockVarianceService),
   * not undone — the shrinkage already happened whether or not the queue
   * entry gets closed out.
   */
  @OnDomainEvent(DomainEvent.StockVarianceRecorded)
  async onStockVarianceRecorded(payload: StockVarianceRecordedPayload): Promise<void> {
    const source = DomainEvent.StockVarianceRecorded;
    if (await this.accounting.findPostedEntry(source, payload.stockVarianceId)) return;
    if (!payload.unitCost || payload.unitCost <= 0) return;

    const amountMinor = payload.unitCost * payload.overshootQty;
    if (amountMinor <= 0) return;

    const accountId = await this.accounting.accountIdsByCode([
      ACCOUNT_CODE.INVENTORY_SHRINKAGE,
      ACCOUNT_CODE.INVENTORY,
    ]);
    const shrinkage = accountId.get(ACCOUNT_CODE.INVENTORY_SHRINKAGE);
    const inventory = accountId.get(ACCOUNT_CODE.INVENTORY);
    if (!shrinkage || !inventory) {
      this.logger.error(
        `Chart of accounts is missing Inventory Shrinkage or Inventory — cannot post the variance ${payload.stockVarianceId}.`,
      );
      return;
    }

    await this.accounting.postEntry({
      date: new Date(),
      source,
      sourceRef: payload.stockVarianceId,
      memo: `Stock variance — oversold ${payload.overshootQty}`,
      lines: [
        { accountId: shrinkage, debitMinor: amountMinor },
        { accountId: inventory, creditMinor: amountMinor },
      ],
    });
  }

  /**
   * Dr Accounts Receivable (source brand) · Cr Intercompany Revenue (source
   * brand, counterparty = destination) · Dr Intercompany Cost of Goods
   * (destination brand, counterparty = source) · Cr Accounts Payable
   * (destination brand) — R17's own words made literal: "brand A books
   * revenue and brand B books cost." Both intercompany lines post in the
   * SAME entry, for the SAME amount, so ConsolidationService's elimination
   * (WO-20.6) always finds a matched pair with nothing unmatched — true only
   * because R12 fixes the transfer price at cost with no markup, so there is
   * no unrealized intercompany profit to defer (that harder case stays
   * unattempted, per ConsolidationService's own doc comment).
   *
   * Does not touch the Inventory account — the physical stock ledger
   * (InventoryService, via TransfersService.dispatch()/receive()) already
   * moved the quantity between locations; ordinary sale postings
   * (onOrderPlaced) do not dimension Inventory/COGS by brand either, so this
   * rule stays consistent with that existing precedent rather than inventing
   * a new one.
   */
  @OnDomainEvent(DomainEvent.InterBranchTransferInvoiced)
  async onInterBranchTransferInvoiced(payload: InterBranchTransferInvoicedPayload): Promise<void> {
    const source = DomainEvent.InterBranchTransferInvoiced;
    if (payload.amountMinor <= 0) return;
    if (await this.accounting.findPostedEntry(source, payload.invoiceId)) return;

    const accountId = await this.accounting.accountIdsByCode([
      ACCOUNT_CODE.ACCOUNTS_RECEIVABLE,
      ACCOUNT_CODE.INTERCOMPANY_REVENUE,
      ACCOUNT_CODE.INTERCOMPANY_COGS,
      ACCOUNT_CODE.ACCOUNTS_PAYABLE,
    ]);
    const ar = accountId.get(ACCOUNT_CODE.ACCOUNTS_RECEIVABLE);
    const icRevenue = accountId.get(ACCOUNT_CODE.INTERCOMPANY_REVENUE);
    const icCogs = accountId.get(ACCOUNT_CODE.INTERCOMPANY_COGS);
    const ap = accountId.get(ACCOUNT_CODE.ACCOUNTS_PAYABLE);
    if (!ar || !icRevenue || !icCogs || !ap) {
      this.logger.error(
        `Chart of accounts is missing AR, Intercompany Revenue, Intercompany COGS or AP — cannot post invoice ${payload.invoiceNumber}.`,
      );
      return;
    }

    await this.accounting.postEntry({
      date: new Date(payload.issuedAt),
      source,
      sourceRef: payload.invoiceId,
      memo: `Inter-brand transfer — invoice ${payload.invoiceNumber}`,
      lines: [
        { accountId: ar, debitMinor: payload.amountMinor, retailBrandId: payload.sourceRetailBrandId },
        {
          accountId: icRevenue,
          creditMinor: payload.amountMinor,
          retailBrandId: payload.sourceRetailBrandId,
          counterpartyBrandId: payload.destinationRetailBrandId,
        },
        {
          accountId: icCogs,
          debitMinor: payload.amountMinor,
          retailBrandId: payload.destinationRetailBrandId,
          counterpartyBrandId: payload.sourceRetailBrandId,
        },
        { accountId: ap, creditMinor: payload.amountMinor, retailBrandId: payload.destinationRetailBrandId },
      ],
    });
  }

  /**
   * WO-23.1 — finance is the eighth posting rule (the count in file `50`'s
   * hardening record was correct at seven; this changes it). Dr Direct
   * Expenses or Operating Expenses, by `ExpenseCategory.isDirect`, same
   * split `04-finance.md`'s reports already use above/below the
   * gross-profit line · Cr Accounts Payable when unpaid at the moment
   * recorded, or Cash & Bank when `paidAt` is already set — the same
   * unpaid-vs-paid branch `onSupplierBillRaised`/`onSupplierBillPaid` model,
   * collapsed into one handler because an Expense, unlike a SupplierBill,
   * has no separate "paid" event yet (WO-B.2 is a later work order in this
   * tranche; a later payment on an initially-unpaid expense is not covered
   * here — see finance.service.ts).
   */
  @OnDomainEvent(DomainEvent.ExpenseRecorded)
  async onExpenseRecorded(payload: ExpenseRecordedPayload): Promise<void> {
    const source = DomainEvent.ExpenseRecorded;
    if (await this.accounting.findPostedEntry(source, payload.expenseId)) return;
    if (payload.amountMinor <= 0) return;

    const accountId = await this.accounting.accountIdsByCode([
      ACCOUNT_CODE.DIRECT_EXPENSES,
      ACCOUNT_CODE.OPERATING_EXPENSES,
      ACCOUNT_CODE.ACCOUNTS_PAYABLE,
      ACCOUNT_CODE.CASH_AND_BANK,
    ]);
    const expenseAccount = accountId.get(payload.isDirect ? ACCOUNT_CODE.DIRECT_EXPENSES : ACCOUNT_CODE.OPERATING_EXPENSES);
    const creditAccount = accountId.get(payload.paidAtIso ? ACCOUNT_CODE.CASH_AND_BANK : ACCOUNT_CODE.ACCOUNTS_PAYABLE);
    if (!expenseAccount || !creditAccount) {
      this.logger.error(`Chart of accounts is missing an expense account, Accounts Payable or Cash & Bank — cannot post expense ${payload.expenseId}.`);
      return;
    }

    await this.accounting.postEntry({
      date: new Date(payload.incurredAt),
      source,
      sourceRef: payload.expenseId,
      memo: `Expense — ${payload.categoryKey}`,
      lines: [
        { accountId: expenseAccount, debitMinor: payload.amountMinor },
        {
          accountId: creditAccount,
          creditMinor: payload.amountMinor,
          supplierId: payload.paidAtIso ? null : payload.supplierId,
        },
      ],
    });
  }
}
