import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BRAND } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { paginated, type PaginatedResult } from '../../../core/common/dto/pagination.dto';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { ApprovalService } from '../../../core/approvals/approval.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { AuditService } from '../../../core/audit/audit.service';
import { Prisma, type WalletAccount, type WalletEntry, type WalletAdjustmentRequest } from '../../../core/prisma/client';
import { CREDIT_NOTE_SERVICE, type CreditNoteService } from './wallet-credit-note.port';

type Tx = Prisma.TransactionClient | PrismaService;

/**
 * doc 155 (WO-155.2). Ships module-off — WalletModule is registered in
 * modules.registry.ts but enabled in no deployment's MODULES today, and
 * `placeOrderWithWalletCredit()` is not wired into the live checkout path
 * (orders.service.ts / cart) — see DECISIONS.md and wallet.module.ts's own
 * comment. Every method here is fully built and tested directly; nothing
 * about this class itself is a stub.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly settings: SettingsService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    @Inject(CREDIT_NOTE_SERVICE) private readonly creditNotes: CreditNoteService,
  ) {}

  /** One wallet per customer, created lazily on first purchase. */
  async getOrCreateAccount(customerId: string, tx: Tx = this.prisma): Promise<WalletAccount> {
    const existing = await tx.walletAccount.findUnique({ where: { customerId } });
    if (existing) return existing;
    return tx.walletAccount.create({ data: { customerId, currency: BRAND.locale.currency } });
  }

  /**
   * PURCHASE - RESERVE + RELEASE_RESERVATION - REFUND(on PURCHASE) ± ADJUSTMENT
   * — REDEEM does not further reduce availableBalance beyond what its own
   * RESERVE already did (§1's own note). A REFUND that reverses an
   * already-REDEEMed order (refund()'s REDEEM branch, below) never writes a
   * customer-side WalletEntry at all — that credit already left the
   * customer's own spendable pool at RESERVE time, so nothing here would be
   * correct to add back; see refund()'s own comment.
   */
  async availableBalance(accountId: string, tx: Tx = this.prisma): Promise<number> {
    const sums = await tx.walletEntry.groupBy({
      by: ['type'],
      where: { accountId },
      _sum: { amountMinor: true },
    });
    const byType = new Map(sums.map((row) => [row.type, row._sum.amountMinor ?? 0]));
    const purchase = byType.get('PURCHASE') ?? 0;
    const reserve = byType.get('RESERVE') ?? 0;
    const release = byType.get('RELEASE_RESERVATION') ?? 0;
    const refund = byType.get('REFUND') ?? 0;
    const adjustment = byType.get('ADJUSTMENT') ?? 0;
    return purchase - reserve + release - refund + adjustment;
  }

  async balance(customerId: string): Promise<{ accountId: string | null; balance: number; currency: string }> {
    const account = await this.prisma.walletAccount.findUnique({ where: { customerId } });
    if (!account) return { accountId: null, balance: 0, currency: BRAND.locale.currency };
    return { accountId: account.id, balance: await this.availableBalance(account.id), currency: account.currency };
  }

  /** Admin lookup — a staff member starts from the customer they are helping, not an opaque account id. */
  async findAccountByCustomer(customerId: string): Promise<WalletAccount> {
    const account = await this.prisma.walletAccount.findUnique({ where: { customerId } });
    if (!account) throw new NotFoundException('This customer has no wallet.');
    return account;
  }

  async ledger(
    customerId: string,
    query: { skip: number; take: number; order: 'asc' | 'desc' },
  ): Promise<PaginatedResult<WalletEntry>> {
    const account = await this.prisma.walletAccount.findUnique({ where: { customerId } });
    if (!account) return paginated([], 0, { page: 1, pageSize: query.take });

    const where = { accountId: account.id };
    const [rows, total] = await Promise.all([
      this.prisma.walletEntry.findMany({ where, skip: query.skip, take: query.take, orderBy: { createdAt: query.order } }),
      this.prisma.walletEntry.count({ where }),
    ]);
    return paginated(rows, total, { page: Math.floor(query.skip / query.take) + 1, pageSize: query.take });
  }

  /**
   * Real money into Newax's own bank account (an existing Payment row —
   * this method never touches a gateway itself), booked as deferred
   * revenue. `sourceRef = paymentId` is the idempotency key: a retried call
   * for the same payment is a no-op against the unique (accountId, type,
   * sourceRef) row, returning the entry already written.
   */
  /** Admin ledger — same shape as `ledger()` but by accountId, for a staff screen that already resolved the account. */
  async ledgerByAccountId(
    accountId: string,
    query: { skip: number; take: number; order: 'asc' | 'desc' },
  ): Promise<PaginatedResult<WalletEntry>> {
    const where = { accountId };
    const [rows, total] = await Promise.all([
      this.prisma.walletEntry.findMany({ where, skip: query.skip, take: query.take, orderBy: { createdAt: query.order } }),
      this.prisma.walletEntry.count({ where }),
    ]);
    return paginated(rows, total, { page: Math.floor(query.skip / query.take) + 1, pageSize: query.take });
  }

  async purchaseCredit(customerId: string, input: { paymentId: string; amountMinor: number }): Promise<WalletEntry> {
    if (input.amountMinor <= 0) throw new BadRequestException('A wallet purchase must be a positive amount.');

    return this.prisma.$transaction(async (tx) => {
      const account = await this.getOrCreateAccount(customerId, tx);
      if (account.status !== 'ACTIVE') {
        throw new BadRequestException(`This wallet is ${account.status.toLowerCase()} and cannot accept new credit.`);
      }

      const existing = await tx.walletEntry.findUnique({
        where: { accountId_type_sourceRef: { accountId: account.id, type: 'PURCHASE', sourceRef: input.paymentId } },
      });
      if (existing) return existing;

      const entry = await tx.walletEntry.create({
        data: {
          accountId: account.id,
          type: 'PURCHASE',
          amountMinor: input.amountMinor,
          sourceRef: input.paymentId,
        },
      });

      await this.events.publish(
        DomainEvent.WalletCreditPurchased,
        {
          walletAccountId: account.id,
          customerId,
          paymentId: input.paymentId,
          amountMinor: input.amountMinor,
          currency: account.currency,
        },
        tx,
      );

      return entry;
    });
  }

  /**
   * Reserve at order placement — the customer's own available balance
   * drops immediately so the same credit can never fund two orders, but
   * nothing is yet owed to any merchant (still entirely Newax's own
   * liability to the customer). Idempotent on `orderId`: a retried call for
   * an order that already has a RESERVE returns it unchanged rather than
   * re-checking balance (which would double-count the earmark against
   * itself).
   *
   * NOT wired into the live checkout path — see this class's own header
   * comment and DECISIONS.md. Callable directly (and covered by
   * wallet.service.spec.ts) so the mechanism is real and verified before a
   * human connects it.
   */
  async placeOrderWithWalletCredit(customerId: string, orderId: string, amountMinor: number, tx: Tx = this.prisma): Promise<WalletEntry> {
    if (amountMinor <= 0) throw new BadRequestException('A wallet reservation must be a positive amount.');

    const run = async (client: Prisma.TransactionClient | PrismaService) => {
      const account = await client.walletAccount.findUnique({ where: { customerId } });
      if (!account) throw new NotFoundException('This customer has no wallet.');
      if (account.status !== 'ACTIVE') {
        throw new BadRequestException(`This wallet is ${account.status.toLowerCase()} and cannot be spent from.`);
      }

      const existing = await client.walletEntry.findUnique({
        where: { accountId_type_sourceRef: { accountId: account.id, type: 'RESERVE', sourceRef: orderId } },
      });
      if (existing) return existing;

      const available = await this.availableBalance(account.id, client);
      if (available < amountMinor) {
        throw new BadRequestException(`Insufficient wallet balance: ${available} available, ${amountMinor} requested.`);
      }

      return client.walletEntry.create({
        data: { accountId: account.id, type: 'RESERVE', amountMinor, orderId, sourceRef: orderId },
      });
    };

    return tx === this.prisma ? this.prisma.$transaction((t) => run(t)) : run(tx);
  }

  /**
   * The RESERVE becomes a REDEEM — exactly the moment named in the owner's
   * own words: "deducted upon merchant confirmation." Creates the
   * MerchantPayable in the SAME transaction (§3: "the two happen in one
   * transaction, since a redeemed credit and a merchant's own earned
   * payable are the same fact viewed from two sides") — both commit or
   * neither does. Idempotent on `orderId`: a redelivered confirmation event
   * or a retried call returns the REDEEM/MerchantPayable pair already
   * written, never a second one.
   */
  async onMerchantConfirmed(
    orderId: string,
    merchantOrganizationId: string,
    transactionFeeBps: number,
  ): Promise<{ redeemEntry: WalletEntry; merchantPayableId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const alreadyRedeemed = await tx.walletEntry.findFirst({ where: { orderId, type: 'REDEEM' } });
      const existingPayable = await tx.merchantPayable.findUnique({ where: { orderId } });
      if (alreadyRedeemed && existingPayable) {
        return { redeemEntry: alreadyRedeemed, merchantPayableId: existingPayable.id };
      }

      const reservation = await tx.walletEntry.findFirst({ where: { orderId, type: 'RESERVE' } });
      if (!reservation) {
        throw new NotFoundException(`No wallet reservation exists for order ${orderId} to confirm.`);
      }

      const redeemEntry = await tx.walletEntry.create({
        data: {
          accountId: reservation.accountId,
          type: 'REDEEM',
          amountMinor: reservation.amountMinor,
          orderId,
          sourceRef: orderId,
        },
      });

      const feeMinor = Math.round((reservation.amountMinor * transactionFeeBps) / 10_000);
      const netPayableMinor = reservation.amountMinor - feeMinor;

      // The MerchantPayable's own `orderId @unique` is the second half of
      // this transaction's atomicity: a lost race on concurrent calls for
      // the same order throws here (Prisma P2002), rolling back the REDEEM
      // entry just written above too — "both commit or neither does."
      const merchantPayable = await tx.merchantPayable.create({
        data: {
          organizationId: merchantOrganizationId,
          orderId,
          grossMinor: reservation.amountMinor,
          platformFeeMinor: feeMinor,
          netPayableMinor,
        },
      });

      await this.events.publish(
        DomainEvent.WalletCreditRedeemed,
        {
          walletAccountId: reservation.accountId,
          customerId: (await tx.walletAccount.findUniqueOrThrow({ where: { id: reservation.accountId } })).customerId,
          orderId,
          amountMinor: reservation.amountMinor,
          merchantPayableId: merchantPayable.id,
          merchantOrganizationId,
        },
        tx,
      );
      await this.events.publish(
        DomainEvent.MerchantPayableCreated,
        { merchantPayableId: merchantPayable.id, organizationId: merchantOrganizationId, orderId, netPayableMinor },
        tx,
      );

      return { redeemEntry, merchantPayableId: merchantPayable.id };
    });
  }

  /**
   * The merchant never confirmed (rejected, expired) — the earmark returns
   * to available, exactly as if the order had never been placed.
   * Idempotent on `orderId`.
   */
  async onMerchantDeclinedOrExpired(orderId: string): Promise<WalletEntry> {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.walletEntry.findFirst({ where: { orderId, type: 'RESERVE' } });
      if (!reservation) throw new NotFoundException(`No wallet reservation exists for order ${orderId} to release.`);

      const existing = await tx.walletEntry.findUnique({
        where: { accountId_type_sourceRef: { accountId: reservation.accountId, type: 'RELEASE_RESERVATION', sourceRef: orderId } },
      });
      if (existing) return existing;

      return tx.walletEntry.create({
        data: {
          accountId: reservation.accountId,
          type: 'RELEASE_RESERVATION',
          amountMinor: reservation.amountMinor,
          orderId,
          sourceRef: orderId,
        },
      });
    });
  }

  /**
   * Reverses a not-yet-redeemed PURCHASE — a straightforward REFUND entry
   * against Newax's own deferred-revenue liability (no CreditNote needed;
   * doc 145's mechanism is for the REDEEM branch below). `paymentId` is the
   * PURCHASE's own sourceRef, so `@@unique` refuses a double refund of the
   * same payment.
   */
  async refundPurchase(customerId: string, input: { paymentId: string; amountMinor: number; actorId: string }): Promise<WalletEntry> {
    if (input.amountMinor <= 0) throw new BadRequestException('A refund must be a positive amount.');

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.walletAccount.findUnique({ where: { customerId } });
      if (!account) throw new NotFoundException('This customer has no wallet.');

      const purchase = await tx.walletEntry.findUnique({
        where: { accountId_type_sourceRef: { accountId: account.id, type: 'PURCHASE', sourceRef: input.paymentId } },
      });
      if (!purchase) throw new NotFoundException('No wallet purchase exists for that payment.');
      if (input.amountMinor > purchase.amountMinor) {
        throw new BadRequestException(`Refund of ${input.amountMinor} exceeds the original purchase of ${purchase.amountMinor}.`);
      }

      const existing = await tx.walletEntry.findUnique({
        where: { accountId_type_sourceRef: { accountId: account.id, type: 'REFUND', sourceRef: input.paymentId } },
      });
      if (existing) return existing;

      const entry = await tx.walletEntry.create({
        data: {
          accountId: account.id,
          type: 'REFUND',
          amountMinor: input.amountMinor,
          sourceRef: input.paymentId,
          actorId: input.actorId,
          reason: 'Reversal of an unredeemed wallet credit purchase.',
        },
      });

      await this.events.publish(
        DomainEvent.WalletCreditRefunded,
        { walletAccountId: account.id, customerId, reversalOf: 'PURCHASE', orderId: null, paymentId: input.paymentId, amountMinor: input.amountMinor },
        tx,
      );

      return entry;
    });
  }

  /**
   * Reverses an ALREADY-REDEEMED order. Never writes a customer-facing
   * WalletEntry — that credit already left the customer's own spendable
   * pool at RESERVE time and is now the merchant's own settlement problem,
   * exactly as §3 frames it ("the same fact viewed from two sides"). The
   * correction lands entirely on the MerchantPayable side, through the
   * CreditNoteService port (see wallet-credit-note.port.ts for why this is
   * a port rather than doc 145's own CreditNote model directly).
   */
  async refundRedeemedOrder(
    orderId: string,
    input: { amountMinor: number; reason: string; actorId: string },
  ): Promise<{ merchantPayableId: string; creditNoteId: string }> {
    if (input.amountMinor <= 0) throw new BadRequestException('A refund must be a positive amount.');

    return this.prisma.$transaction(async (tx) => {
      const redeemEntry = await tx.walletEntry.findFirst({ where: { orderId, type: 'REDEEM' } });
      if (!redeemEntry) throw new NotFoundException(`Order ${orderId} was never redeemed from a wallet — nothing to reverse here.`);

      const payable = await tx.merchantPayable.findUnique({ where: { orderId } });
      if (!payable) throw new NotFoundException(`No MerchantPayable exists for order ${orderId}.`);

      const result = await this.creditNotes.issueForMerchantPayable(
        { merchantPayableId: payable.id, amountMinor: input.amountMinor, reason: input.reason, actorId: input.actorId },
        tx,
      );

      const account = await tx.walletAccount.findUniqueOrThrow({ where: { id: redeemEntry.accountId } });
      await this.events.publish(
        DomainEvent.WalletCreditRefunded,
        { walletAccountId: account.id, customerId: account.customerId, reversalOf: 'REDEEM', orderId, paymentId: null, amountMinor: input.amountMinor },
        tx,
      );

      return { merchantPayableId: payable.id, creditNoteId: result.id };
    });
  }

  /**
   * A manual, always-reasoned correction. Below the configurable threshold
   * (`SettingKey.WalletAdjustmentApprovalThresholdMinor`) it is self-serve
   * — a holder of `finance.wallets.adjust` writes the WalletEntry directly.
   * At or above it, it is a REQUEST: a `WalletAdjustmentRequest` opens an
   * approval chain (reusing the generic `ApprovalChain` engine) and no
   * `WalletEntry` exists until a *different* holder of
   * `finance.wallets.adjust.approve` decides it — "the threshold nobody
   * approves alone."
   */
  async adjustment(
    accountId: string,
    input: { amountMinor: number; reason: string; requestedByUserId: string },
  ): Promise<{ committed: true; entry: WalletEntry } | { committed: false; request: WalletAdjustmentRequest }> {
    if (input.amountMinor === 0) throw new BadRequestException('An adjustment must be non-zero.');
    if (!input.reason?.trim()) throw new BadRequestException('An adjustment always needs a reason.');

    const threshold = await this.settings.get<number>(SettingKey.WalletAdjustmentApprovalThresholdMinor);

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.walletAccount.findUnique({ where: { id: accountId } });
      if (!account) throw new NotFoundException('Wallet account not found.');

      if (Math.abs(input.amountMinor) < threshold) {
        const entry = await tx.walletEntry.create({
          data: {
            accountId,
            type: 'ADJUSTMENT',
            amountMinor: input.amountMinor,
            sourceRef: randomUUID(),
            actorId: input.requestedByUserId,
            reason: input.reason,
          },
        });
        return { committed: true as const, entry };
      }

      const request = await tx.walletAdjustmentRequest.create({
        data: {
          accountId,
          amountMinor: input.amountMinor,
          reason: input.reason,
          requestedByUserId: input.requestedByUserId,
        },
      });
      await this.approvals.start(
        'WALLET_ADJUSTMENT',
        request.id,
        [{ approverRoleId: 'finance.wallets.adjust.approve' }],
        tx,
      );
      return { committed: false as const, request };
    });
  }

  /**
   * The staff member who requested an above-threshold adjustment is never
   * its own approver — identical to every other self-approval refusal in
   * this document set (`StockVarianceService.resolve()`'s own idiom).
   */
  async decideAdjustment(
    requestId: string,
    actorId: string,
    decision: 'APPROVE' | 'REJECT',
    comment?: string,
  ): Promise<WalletAdjustmentRequest> {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.walletAdjustmentRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new NotFoundException('Wallet adjustment request not found.');
      if (request.requestedByUserId === actorId) {
        throw new ForbiddenException('The staff member who requested this adjustment cannot approve it themselves.');
      }
      if (request.status !== 'PENDING') {
        throw new ConflictException(`This adjustment request is already ${request.status}.`);
      }

      const chain = await this.approvals.getChain('WALLET_ADJUSTMENT', requestId, tx);
      if (!chain) throw new NotFoundException('No approval chain exists for this request.');
      const step = chain.steps[chain.currentStep - 1];
      if (!step) throw new NotFoundException('This approval chain has no current step.');

      await this.approvals.decide(chain.id, step.id, decision, actorId, comment, tx);

      if (decision === 'REJECT') {
        return tx.walletAdjustmentRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', decidedAt: new Date() } });
      }

      const entry = await tx.walletEntry.create({
        data: {
          accountId: request.accountId,
          type: 'ADJUSTMENT',
          amountMinor: request.amountMinor,
          sourceRef: request.id,
          actorId,
          reason: request.reason,
        },
      });
      const updated = await tx.walletAdjustmentRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', decidedAt: new Date(), walletEntryId: entry.id },
      });

      await this.audit.record({
        actorId,
        action: 'wallet.adjustment_approved',
        entity: 'WalletAdjustmentRequest',
        entityId: requestId,
        data: { amountMinor: request.amountMinor, requestedByUserId: request.requestedByUserId },
      });

      return updated;
    });
  }

  /**
   * WO-155.2's own named entry point — reverses a PURCHASE or a REDEEM
   * (§1/the reversal-document lens), dispatching to whichever of the two
   * genuinely different corrections above the input actually names. Kept
   * as a thin dispatcher rather than one method with two shapes crammed
   * into it, so each branch's own precondition checks (which id it needs,
   * what it may exceed) stay a compile-time guarantee, not a runtime
   * `if (dto.paymentId) ... else ...`.
   */
  async refund(
    input:
      | { kind: 'PURCHASE'; customerId: string; paymentId: string; amountMinor: number; actorId: string }
      | { kind: 'REDEEM'; orderId: string; amountMinor: number; reason: string; actorId: string },
  ): Promise<WalletEntry | { merchantPayableId: string; creditNoteId: string }> {
    if (input.kind === 'PURCHASE') {
      return this.refundPurchase(input.customerId, { paymentId: input.paymentId, amountMinor: input.amountMinor, actorId: input.actorId });
    }
    return this.refundRedeemedOrder(input.orderId, { amountMinor: input.amountMinor, reason: input.reason, actorId: input.actorId });
  }

  /**
   * `WalletAccountStatus = FROZEN` stops all new RESERVEs immediately (the
   * "grant that ends itself" lens) — checked in `placeOrderWithWalletCredit`
   * and `purchaseCredit` above. Gated by `finance.wallets.adjust.approve`
   * at the controller (freezing another person's wallet is not a routine
   * `.adjust`-level action).
   */
  async setAccountStatus(accountId: string, status: 'ACTIVE' | 'FROZEN' | 'CLOSED', actorId: string): Promise<WalletAccount> {
    const updated = await this.prisma.walletAccount.update({ where: { id: accountId }, data: { status } });
    await this.audit.record({
      actorId,
      action: 'wallet.account_status_changed',
      entity: 'WalletAccount',
      entityId: accountId,
      data: { status },
    });
    return updated;
  }
}
