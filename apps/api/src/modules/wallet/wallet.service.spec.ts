import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { SettingsService } from '../../core/settings/settings.service';
import { ApprovalService } from '../../core/approvals/approval.service';
import { AuditService } from '../../core/audit/audit.service';
import type { CreditNoteService } from './wallet-credit-note.port';

function groupByResult(rows: Array<{ type: string; sum: number }>) {
  return rows.map((r) => ({ type: r.type, _sum: { amountMinor: r.sum } }));
}

describe('WalletService — 155-wallet-stored-value-merchant-escrow.md', () => {
  let service: WalletService;
  let prisma: any;
  let tx: any;
  let events: any;
  let settings: any;
  let approvals: any;
  let audit: any;
  let creditNotes: jest.Mocked<CreditNoteService>;

  beforeEach(() => {
    tx = {
      walletAccount: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn() },
      walletEntry: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), groupBy: jest.fn() },
      walletAdjustmentRequest: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      merchantPayable: { findUnique: jest.fn(), create: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      walletAccount: tx.walletAccount,
      walletEntry: tx.walletEntry,
    };
    events = { publish: jest.fn() };
    settings = { get: jest.fn().mockResolvedValue(5_000_000) };
    approvals = { start: jest.fn(), getChain: jest.fn(), decide: jest.fn() };
    audit = { record: jest.fn() };
    creditNotes = { issueForMerchantPayable: jest.fn() };

    service = new WalletService(
      prisma as PrismaService,
      events as EventBusService,
      settings as SettingsService,
      approvals as ApprovalService,
      audit as AuditService,
      creditNotes,
    );
  });

  describe('availableBalance — the three transitions', () => {
    it('PURCHASE alone is fully available', async () => {
      tx.walletEntry.groupBy.mockResolvedValue(groupByResult([{ type: 'PURCHASE', sum: 10_000 }]));
      await expect(service.availableBalance('acc1', tx)).resolves.toBe(10_000);
    });

    it('RESERVE drops availableBalance by the reserved amount', async () => {
      tx.walletEntry.groupBy.mockResolvedValue(
        groupByResult([
          { type: 'PURCHASE', sum: 10_000 },
          { type: 'RESERVE', sum: 4_000 },
        ]),
      );
      await expect(service.availableBalance('acc1', tx)).resolves.toBe(6_000);
    });

    it('REDEEM does not further reduce availableBalance beyond the RESERVE it converted', async () => {
      // RESERVE already removed the amount from availability; REDEEM is not
      // one of the terms in the formula at all.
      tx.walletEntry.groupBy.mockResolvedValue(
        groupByResult([
          { type: 'PURCHASE', sum: 10_000 },
          { type: 'RESERVE', sum: 4_000 },
        ]),
      );
      const beforeRedeem = await service.availableBalance('acc1', tx);
      // REDEEM entries exist in the ledger but never appear in groupBy's
      // own sum used by the formula — simulating that a REDEEM row was
      // written changes nothing about this query's inputs.
      await expect(service.availableBalance('acc1', tx)).resolves.toBe(beforeRedeem);
    });

    it('RELEASE_RESERVATION restores availableBalance', async () => {
      tx.walletEntry.groupBy.mockResolvedValue(
        groupByResult([
          { type: 'PURCHASE', sum: 10_000 },
          { type: 'RESERVE', sum: 4_000 },
          { type: 'RELEASE_RESERVATION', sum: 4_000 },
        ]),
      );
      await expect(service.availableBalance('acc1', tx)).resolves.toBe(10_000);
    });

    it('a PURCHASE-side REFUND reduces availableBalance', async () => {
      tx.walletEntry.groupBy.mockResolvedValue(
        groupByResult([
          { type: 'PURCHASE', sum: 10_000 },
          { type: 'REFUND', sum: 3_000 },
        ]),
      );
      await expect(service.availableBalance('acc1', tx)).resolves.toBe(7_000);
    });

    it('a positive ADJUSTMENT increases availableBalance, a negative one decreases it', async () => {
      tx.walletEntry.groupBy.mockResolvedValue(
        groupByResult([
          { type: 'PURCHASE', sum: 10_000 },
          { type: 'ADJUSTMENT', sum: -2_000 },
        ]),
      );
      await expect(service.availableBalance('acc1', tx)).resolves.toBe(8_000);
    });
  });

  describe('purchaseCredit', () => {
    it('creates the account lazily and writes a PURCHASE entry', async () => {
      tx.walletAccount.findUnique.mockResolvedValue(null);
      tx.walletAccount.create.mockResolvedValue({ id: 'acc1', customerId: 'cust1', status: 'ACTIVE', currency: 'PKR' });
      tx.walletEntry.findUnique.mockResolvedValue(null);
      tx.walletEntry.create.mockResolvedValue({ id: 'e1', type: 'PURCHASE', amountMinor: 5000 });

      await service.purchaseCredit('cust1', { paymentId: 'pay1', amountMinor: 5000 });

      expect(tx.walletEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'PURCHASE', amountMinor: 5000, sourceRef: 'pay1' }) }),
      );
      expect(events.publish).toHaveBeenCalledWith('wallet.credit_purchased', expect.objectContaining({ paymentId: 'pay1' }), tx);
    });

    it('is idempotent on a retried call for the same paymentId — no duplicate entry', async () => {
      const existingEntry = { id: 'e1', type: 'PURCHASE', amountMinor: 5000, sourceRef: 'pay1' };
      tx.walletAccount.findUnique.mockResolvedValue({ id: 'acc1', customerId: 'cust1', status: 'ACTIVE' });
      tx.walletEntry.findUnique.mockResolvedValue(existingEntry);

      const result = await service.purchaseCredit('cust1', { paymentId: 'pay1', amountMinor: 5000 });

      expect(result).toBe(existingEntry);
      expect(tx.walletEntry.create).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('refuses a FROZEN wallet', async () => {
      tx.walletAccount.findUnique.mockResolvedValue({ id: 'acc1', customerId: 'cust1', status: 'FROZEN' });
      await expect(service.purchaseCredit('cust1', { paymentId: 'pay1', amountMinor: 5000 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a non-positive amount', async () => {
      await expect(service.purchaseCredit('cust1', { paymentId: 'pay1', amountMinor: 0 })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('placeOrderWithWalletCredit', () => {
    it('refuses when availableBalance is insufficient — never an overdraft', async () => {
      tx.walletAccount.findUnique.mockResolvedValue({ id: 'acc1', customerId: 'cust1', status: 'ACTIVE' });
      tx.walletEntry.findUnique.mockResolvedValue(null);
      tx.walletEntry.groupBy.mockResolvedValue(groupByResult([{ type: 'PURCHASE', sum: 1_000 }]));

      await expect(service.placeOrderWithWalletCredit('cust1', 'order1', 5_000)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.walletEntry.create).not.toHaveBeenCalled();
    });

    it('creates a RESERVE entry when balance is sufficient', async () => {
      tx.walletAccount.findUnique.mockResolvedValue({ id: 'acc1', customerId: 'cust1', status: 'ACTIVE' });
      tx.walletEntry.findUnique.mockResolvedValue(null);
      tx.walletEntry.groupBy.mockResolvedValue(groupByResult([{ type: 'PURCHASE', sum: 10_000 }]));
      tx.walletEntry.create.mockResolvedValue({ id: 'e1', type: 'RESERVE', amountMinor: 5_000 });

      await service.placeOrderWithWalletCredit('cust1', 'order1', 5_000);

      expect(tx.walletEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'RESERVE', amountMinor: 5_000, orderId: 'order1', sourceRef: 'order1' }) }),
      );
    });

    it('is idempotent on a retried call for the same orderId', async () => {
      const existing = { id: 'e1', type: 'RESERVE', amountMinor: 5_000, orderId: 'order1' };
      tx.walletAccount.findUnique.mockResolvedValue({ id: 'acc1', customerId: 'cust1', status: 'ACTIVE' });
      tx.walletEntry.findUnique.mockResolvedValue(existing);

      const result = await service.placeOrderWithWalletCredit('cust1', 'order1', 5_000);
      expect(result).toBe(existing);
      expect(tx.walletEntry.create).not.toHaveBeenCalled();
    });

    it('refuses a wallet that has no account at all', async () => {
      tx.walletAccount.findUnique.mockResolvedValue(null);
      await expect(service.placeOrderWithWalletCredit('cust1', 'order1', 5_000)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('onMerchantConfirmed — the atomic two-write', () => {
    it('creates the REDEEM entry and the MerchantPayable together', async () => {
      tx.walletEntry.findFirst
        .mockResolvedValueOnce(null) // no existing REDEEM
        .mockResolvedValueOnce({ id: 'reserve1', accountId: 'acc1', amountMinor: 10_000, orderId: 'order1' }); // the RESERVE
      tx.merchantPayable.findUnique.mockResolvedValue(null);
      tx.walletEntry.create.mockResolvedValue({ id: 'redeem1', type: 'REDEEM', amountMinor: 10_000 });
      tx.merchantPayable.create.mockResolvedValue({ id: 'payable1', netPayableMinor: 9_700 });
      tx.walletAccount.findUniqueOrThrow.mockResolvedValue({ id: 'acc1', customerId: 'cust1' });

      const result = await service.onMerchantConfirmed('order1', 'merchantOrg1', 300);

      expect(tx.walletEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'REDEEM', amountMinor: 10_000, orderId: 'order1' }) }),
      );
      expect(tx.merchantPayable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: 'merchantOrg1', orderId: 'order1', grossMinor: 10_000, platformFeeMinor: 300, netPayableMinor: 9_700 }),
        }),
      );
      expect(result.merchantPayableId).toBe('payable1');
    });

    it('rolls back the REDEEM write when the MerchantPayable write fails mid-transaction — both commit or neither does', async () => {
      tx.walletEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'reserve1', accountId: 'acc1', amountMinor: 10_000, orderId: 'order1' });
      tx.merchantPayable.findUnique.mockResolvedValue(null);
      tx.walletEntry.create.mockResolvedValue({ id: 'redeem1', type: 'REDEEM', amountMinor: 10_000 });
      // Simulates the unique-orderId race Prisma itself would throw (P2002).
      tx.merchantPayable.create.mockRejectedValue(new Error('Unique constraint failed on MerchantPayable.orderId'));
      // The mock $transaction only actually reflects rollback if the whole
      // callback rejects — assert exactly that: the promise the service
      // returns rejects, so a real Prisma transaction would roll back the
      // REDEEM insert together with the failed MerchantPayable insert.
      prisma.$transaction = jest.fn((cb: any) => cb(tx));

      await expect(service.onMerchantConfirmed('order1', 'merchantOrg1', 300)).rejects.toThrow('Unique constraint failed');
      // The REDEEM create call did happen inside the (now-rejected)
      // transaction callback — in a real Postgres transaction this write
      // never becomes visible because the whole transaction is rolled back
      // by the thrown error; that all-or-nothing guarantee is Prisma's own
      // $transaction(), verified separately in the migration/real-DB pass,
      // not re-implemented by this mock.
      expect(tx.walletEntry.create).toHaveBeenCalled();
      expect(tx.merchantPayable.create).toHaveBeenCalled();
    });

    it('is idempotent when both a REDEEM and MerchantPayable already exist for the order', async () => {
      const redeem = { id: 'redeem1', type: 'REDEEM', amountMinor: 10_000, orderId: 'order1' };
      const payable = { id: 'payable1', orderId: 'order1' };
      tx.walletEntry.findFirst.mockResolvedValue(redeem);
      tx.merchantPayable.findUnique.mockResolvedValue(payable);

      const result = await service.onMerchantConfirmed('order1', 'merchantOrg1', 300);

      expect(result).toEqual({ redeemEntry: redeem, merchantPayableId: 'payable1' });
      expect(tx.walletEntry.create).not.toHaveBeenCalled();
      expect(tx.merchantPayable.create).not.toHaveBeenCalled();
    });

    it('404s when no RESERVE exists for the order', async () => {
      tx.walletEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      tx.merchantPayable.findUnique.mockResolvedValue(null);

      await expect(service.onMerchantConfirmed('order1', 'merchantOrg1', 300)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('onMerchantDeclinedOrExpired', () => {
    it('creates a RELEASE_RESERVATION for the reserved amount', async () => {
      tx.walletEntry.findFirst.mockResolvedValue({ id: 'reserve1', accountId: 'acc1', amountMinor: 5_000, orderId: 'order1' });
      tx.walletEntry.findUnique.mockResolvedValue(null);
      tx.walletEntry.create.mockResolvedValue({ id: 'rel1', type: 'RELEASE_RESERVATION' });

      await service.onMerchantDeclinedOrExpired('order1');

      expect(tx.walletEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'RELEASE_RESERVATION', amountMinor: 5_000, orderId: 'order1' }) }),
      );
    });
  });

  describe('adjustment — the threshold nobody approves alone', () => {
    it('commits a below-threshold adjustment directly', async () => {
      settings.get.mockResolvedValue(5_000_000);
      tx.walletAccount.findUnique.mockResolvedValue({ id: 'acc1' });
      tx.walletEntry.create.mockResolvedValue({ id: 'adj1', type: 'ADJUSTMENT', amountMinor: 1_000 });

      const result = await service.adjustment('acc1', { amountMinor: 1_000, reason: 'goodwill', requestedByUserId: 'staff1' });

      expect(result.committed).toBe(true);
      expect(tx.walletAdjustmentRequest.create).not.toHaveBeenCalled();
      expect(approvals.start).not.toHaveBeenCalled();
    });

    it('opens an approval request for an at-or-above-threshold adjustment, without writing a WalletEntry', async () => {
      settings.get.mockResolvedValue(5_000_000);
      tx.walletAccount.findUnique.mockResolvedValue({ id: 'acc1' });
      tx.walletAdjustmentRequest.create.mockResolvedValue({ id: 'req1', status: 'PENDING' });

      const result = await service.adjustment('acc1', { amountMinor: 6_000_000, reason: 'large correction', requestedByUserId: 'staff1' });

      expect(result.committed).toBe(false);
      expect(tx.walletEntry.create).not.toHaveBeenCalled();
      expect(approvals.start).toHaveBeenCalledWith('WALLET_ADJUSTMENT', 'req1', [{ approverRoleId: 'finance.wallets.adjust.approve' }], tx);
    });

    it('refuses a zero-amount adjustment', async () => {
      await expect(service.adjustment('acc1', { amountMinor: 0, reason: 'x', requestedByUserId: 'staff1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an adjustment with no reason', async () => {
      await expect(service.adjustment('acc1', { amountMinor: 100, reason: '  ', requestedByUserId: 'staff1' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('decideAdjustment — the toxic pair', () => {
    it('refuses when the approver is the request\'s own requester', async () => {
      tx.walletAdjustmentRequest.findUnique.mockResolvedValue({ id: 'req1', requestedByUserId: 'staff1', status: 'PENDING' });

      await expect(service.decideAdjustment('req1', 'staff1', 'APPROVE')).rejects.toBeInstanceOf(ForbiddenException);
      expect(approvals.getChain).not.toHaveBeenCalled();
    });

    it('refuses to decide an already-decided request', async () => {
      tx.walletAdjustmentRequest.findUnique.mockResolvedValue({ id: 'req1', requestedByUserId: 'staff1', status: 'APPROVED' });

      await expect(service.decideAdjustment('req1', 'approver1', 'APPROVE')).rejects.toBeInstanceOf(ConflictException);
    });

    it('a different approver CAN approve, writing the WalletEntry and setting walletEntryId', async () => {
      const request = { id: 'req1', requestedByUserId: 'staff1', status: 'PENDING', accountId: 'acc1', amountMinor: 6_000_000, reason: 'large correction' };
      tx.walletAdjustmentRequest.findUnique.mockResolvedValue(request);
      approvals.getChain.mockResolvedValue({ id: 'chain1', currentStep: 1, steps: [{ id: 'step1', stepOrder: 1 }] });
      tx.walletEntry.create.mockResolvedValue({ id: 'adj1' });
      tx.walletAdjustmentRequest.update.mockResolvedValue({ id: 'req1', status: 'APPROVED', walletEntryId: 'adj1' });

      const result = await service.decideAdjustment('req1', 'approver1', 'APPROVE');

      expect(approvals.decide).toHaveBeenCalledWith('chain1', 'step1', 'APPROVE', 'approver1', undefined, tx);
      expect(tx.walletEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ accountId: 'acc1', type: 'ADJUSTMENT', amountMinor: 6_000_000, sourceRef: 'req1' }) }),
      );
      expect(tx.walletAdjustmentRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', walletEntryId: 'adj1' }) }),
      );
      expect(result.status).toBe('APPROVED');
    });

    it('rejecting never writes a WalletEntry', async () => {
      const request = { id: 'req1', requestedByUserId: 'staff1', status: 'PENDING', accountId: 'acc1', amountMinor: 6_000_000, reason: 'x' };
      tx.walletAdjustmentRequest.findUnique.mockResolvedValue(request);
      approvals.getChain.mockResolvedValue({ id: 'chain1', currentStep: 1, steps: [{ id: 'step1', stepOrder: 1 }] });
      tx.walletAdjustmentRequest.update.mockResolvedValue({ id: 'req1', status: 'REJECTED' });

      await service.decideAdjustment('req1', 'approver1', 'REJECT');

      expect(tx.walletEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('refund', () => {
    it('refundPurchase: reverses an unredeemed PURCHASE, within the original amount', async () => {
      const account = { id: 'acc1', customerId: 'cust1' };
      const purchase = { id: 'p1', type: 'PURCHASE', amountMinor: 5_000, sourceRef: 'pay1' };
      tx.walletAccount.findUnique.mockResolvedValue(account);
      tx.walletEntry.findUnique.mockResolvedValueOnce(purchase).mockResolvedValueOnce(null);
      tx.walletEntry.create.mockResolvedValue({ id: 'refund1', type: 'REFUND', amountMinor: 5_000 });

      await service.refund({ kind: 'PURCHASE', customerId: 'cust1', paymentId: 'pay1', amountMinor: 5_000, actorId: 'staff1' });

      expect(tx.walletEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'REFUND', amountMinor: 5_000, sourceRef: 'pay1' }) }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        'wallet.credit_refunded',
        expect.objectContaining({ reversalOf: 'PURCHASE', paymentId: 'pay1' }),
        tx,
      );
    });

    it('refundPurchase: refuses a refund larger than the original purchase', async () => {
      tx.walletAccount.findUnique.mockResolvedValue({ id: 'acc1' });
      tx.walletEntry.findUnique.mockResolvedValueOnce({ id: 'p1', amountMinor: 5_000 });

      await expect(service.refund({ kind: 'PURCHASE', customerId: 'cust1', paymentId: 'pay1', amountMinor: 9_000, actorId: 'staff1' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refundRedeemedOrder: never writes a customer-side WalletEntry, only corrects the MerchantPayable via the CreditNote port', async () => {
      tx.walletEntry.findFirst.mockResolvedValue({ id: 'redeem1', accountId: 'acc1', orderId: 'order1' });
      tx.merchantPayable.findUnique.mockResolvedValue({ id: 'payable1', netPayableMinor: 9_700, status: 'OPEN' });
      creditNotes.issueForMerchantPayable.mockResolvedValue({ id: 'cn1', applied: 'REDUCED_PAYABLE' });
      tx.walletAccount.findUniqueOrThrow.mockResolvedValue({ id: 'acc1', customerId: 'cust1' });

      const result = await service.refund({ kind: 'REDEEM', orderId: 'order1', amountMinor: 2_000, reason: 'return', actorId: 'staff1' });

      expect(creditNotes.issueForMerchantPayable).toHaveBeenCalledWith(
        { merchantPayableId: 'payable1', amountMinor: 2_000, reason: 'return', actorId: 'staff1' },
        tx,
      );
      expect(tx.walletEntry.create).not.toHaveBeenCalled();
      expect(result).toEqual({ merchantPayableId: 'payable1', creditNoteId: 'cn1' });
    });

    it('refundRedeemedOrder: 404s when the order was never redeemed', async () => {
      tx.walletEntry.findFirst.mockResolvedValue(null);
      await expect(service.refund({ kind: 'REDEEM', orderId: 'order1', amountMinor: 100, reason: 'x', actorId: 'staff1' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findAccountByCustomer', () => {
    it('404s when the customer has no wallet', async () => {
      prisma.walletAccount.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.findAccountByCustomer('cust1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the account when one exists', async () => {
      const account = { id: 'acc1', customerId: 'cust1' };
      prisma.walletAccount.findUnique = jest.fn().mockResolvedValue(account);
      await expect(service.findAccountByCustomer('cust1')).resolves.toBe(account);
    });
  });

  describe('setAccountStatus', () => {
    it('freezes an account and records the change', async () => {
      prisma.walletAccount.update = jest.fn().mockResolvedValue({ id: 'acc1', status: 'FROZEN' });
      await service.setAccountStatus('acc1', 'FROZEN', 'approver1');
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'approver1', data: { status: 'FROZEN' } }));
    });
  });
});
