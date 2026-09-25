import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import {
  DomainEvent,
  type WalletCreditPurchasedPayload,
  type WalletCreditRedeemedPayload,
  type WalletCreditRefundedPayload,
} from '../../core/events/domain-events';
import { AccountingService, type PostLineInput } from './accounting.service';
import { ACCOUNT_CODE } from './chart-of-accounts';

/**
 * doc 155 §3's own "unwritten posting rule" — the same idempotent,
 * event-subscriber posting pattern `posting-rules.subscriber.ts` already
 * uses (R15: accounting couples to nothing, `wallet` never imports this
 * module or knows it exists). Fires only when BOTH `accounting` and
 * `wallet` are enabled in MODULES — today, neither deployment enables
 * `wallet` (DECISIONS.md), so this class exists and is tested but posts
 * nothing in any live deployment.
 */
@Injectable()
export class WalletPostingRulesSubscriber {
  private readonly logger = new Logger(WalletPostingRulesSubscriber.name);

  constructor(private readonly accounting: AccountingService) {}

  /** Dr Cash & Bank · Cr Deferred Revenue — real money in, not yet earned (§1). */
  @OnDomainEvent(DomainEvent.WalletCreditPurchased)
  async onWalletCreditPurchased(payload: WalletCreditPurchasedPayload): Promise<void> {
    const source = DomainEvent.WalletCreditPurchased;
    if (await this.accounting.findPostedEntry(source, payload.paymentId)) return;
    if (payload.amountMinor <= 0) return;

    const accountId = await this.accounting.accountIdsByCode([ACCOUNT_CODE.CASH_AND_BANK, ACCOUNT_CODE.DEFERRED_REVENUE_WALLET]);
    const bank = accountId.get(ACCOUNT_CODE.CASH_AND_BANK);
    const deferred = accountId.get(ACCOUNT_CODE.DEFERRED_REVENUE_WALLET);
    if (!bank || !deferred) {
      this.logger.error('Chart of accounts is missing Cash & Bank or Deferred Revenue — cannot post the wallet purchase.');
      return;
    }

    const lines: PostLineInput[] = [
      { accountId: bank, debitMinor: payload.amountMinor, contactId: payload.customerId },
      { accountId: deferred, creditMinor: payload.amountMinor, contactId: payload.customerId },
    ];

    await this.accounting.postEntry({
      date: new Date(),
      source,
      sourceRef: payload.paymentId,
      memo: `Wallet credit purchase — ${payload.walletAccountId}`,
      lines,
    });
  }

  /**
   * Dr Deferred Revenue · Cr Sales Revenue for the full redeemed amount, AND
   * Dr COGS · Cr Accounts Payable for the merchant's own net payable — one
   * balanced entry with four lines, exactly as §3 describes ("a two-sided
   * entry (revenue recognition + a new payable) instead of one").
   */
  @OnDomainEvent(DomainEvent.WalletCreditRedeemed)
  async onWalletCreditRedeemed(payload: WalletCreditRedeemedPayload): Promise<void> {
    const source = DomainEvent.WalletCreditRedeemed;
    if (await this.accounting.findPostedEntry(source, payload.orderId)) return;
    if (payload.amountMinor <= 0) return;

    const accountId = await this.accounting.accountIdsByCode([
      ACCOUNT_CODE.DEFERRED_REVENUE_WALLET,
      ACCOUNT_CODE.SALES_REVENUE,
      ACCOUNT_CODE.COGS,
      ACCOUNT_CODE.ACCOUNTS_PAYABLE,
    ]);
    const deferred = accountId.get(ACCOUNT_CODE.DEFERRED_REVENUE_WALLET);
    const revenue = accountId.get(ACCOUNT_CODE.SALES_REVENUE);
    const cogs = accountId.get(ACCOUNT_CODE.COGS);
    const payable = accountId.get(ACCOUNT_CODE.ACCOUNTS_PAYABLE);
    if (!deferred || !revenue || !cogs || !payable) {
      this.logger.error('Chart of accounts is missing an account this wallet redemption needs — cannot post it.');
      return;
    }

    const lines: PostLineInput[] = [
      { accountId: deferred, debitMinor: payload.amountMinor, contactId: payload.customerId },
      { accountId: revenue, creditMinor: payload.amountMinor },
    ];

    await this.accounting.postEntry({
      date: new Date(),
      source,
      sourceRef: payload.orderId,
      memo: `Wallet credit redeemed — order ${payload.orderId}`,
      lines,
    });

    // The merchant's own net payable — a second, separate posted entry
    // rather than folding into the four-line one above, so
    // findPostedEntry(MerchantPayableCreated, merchantPayableId) stays each
    // payable's own idempotency key, independent of the revenue entry's.
    if (await this.accounting.findPostedEntry(DomainEvent.MerchantPayableCreated, payload.merchantPayableId)) return;
    await this.accounting.postEntry({
      date: new Date(),
      source: DomainEvent.MerchantPayableCreated,
      sourceRef: payload.merchantPayableId,
      memo: `Merchant payable created — order ${payload.orderId}`,
      lines: [
        { accountId: cogs, debitMinor: payload.amountMinor },
        { accountId: payable, creditMinor: payload.amountMinor },
      ],
    });
  }

  /**
   * Reverses the PURCHASE entry — the customer gets real money back,
   * reversing Newax's own deferred-revenue liability. Never fires for a
   * REDEEM-branch refund: `WalletService.refund()`'s REDEEM path never
   * publishes a fact this subscriber would post against (see that method's
   * own comment) — the MerchantPayable-side correction is
   * `wallet-credit-note.port.ts`'s job, not a GL posting rule's.
   */
  @OnDomainEvent(DomainEvent.WalletCreditRefunded)
  async onWalletCreditRefunded(payload: WalletCreditRefundedPayload): Promise<void> {
    if (payload.reversalOf !== 'PURCHASE' || !payload.paymentId) return;

    const purchaseEntry = await this.accounting.findPostedEntry(DomainEvent.WalletCreditPurchased, payload.paymentId);
    if (!purchaseEntry) {
      this.logger.warn(
        `WalletCreditRefunded fired for payment ${payload.paymentId}, but no POSTED WalletCreditPurchased entry exists — nothing to reverse (already reversed, or the ledger was off when it posted).`,
      );
      return;
    }
    await this.accounting.reverseEntry(purchaseEntry.id, `Refund — wallet purchase ${payload.paymentId}`);
  }
}
