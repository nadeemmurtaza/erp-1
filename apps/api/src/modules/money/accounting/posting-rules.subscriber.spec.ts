import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { AccountingService } from './accounting.service';
import { PostingRulesSubscriber } from './posting-rules.subscriber';
import { ACCOUNT_CODE } from './chart-of-accounts';

const ACCOUNT_ID: Record<string, string> = {
  [ACCOUNT_CODE.ACCOUNTS_RECEIVABLE]: 'acc-ar',
  [ACCOUNT_CODE.SALES_REVENUE]: 'acc-revenue',
  [ACCOUNT_CODE.TAX_PAYABLE]: 'acc-tax',
  [ACCOUNT_CODE.INVENTORY]: 'acc-inventory',
  [ACCOUNT_CODE.COGS]: 'acc-cogs',
  [ACCOUNT_CODE.INVENTORY_SHRINKAGE]: 'acc-shrinkage',
  [ACCOUNT_CODE.CASH_AND_BANK]: 'acc-bank',
  [ACCOUNT_CODE.ACCOUNTS_PAYABLE]: 'acc-ap',
  [ACCOUNT_CODE.FX_GAIN]: 'acc-fx-gain',
  [ACCOUNT_CODE.FX_LOSS]: 'acc-fx-loss',
  [ACCOUNT_CODE.INTERCOMPANY_REVENUE]: 'acc-ic-revenue',
  [ACCOUNT_CODE.INTERCOMPANY_COGS]: 'acc-ic-cogs',
  [ACCOUNT_CODE.DIRECT_EXPENSES]: 'acc-direct-expenses',
  [ACCOUNT_CODE.OPERATING_EXPENSES]: 'acc-operating-expenses',
  [ACCOUNT_CODE.SALARIES_WAGES_EXPENSE]: 'acc-salaries-expense',
  [ACCOUNT_CODE.SALARIES_PAYABLE]: 'acc-salaries-payable',
  [ACCOUNT_CODE.EMPLOYEE_ADVANCES]: 'acc-advances',
  [ACCOUNT_CODE.SALES_RETURNS]: 'acc-sales-returns',
  [ACCOUNT_CODE.PURCHASE_RETURNS]: 'acc-purchase-returns',
  [ACCOUNT_CODE.SETTLEMENT_SHORTFALL_EXPENSE]: 'acc-settlement-shortfall',
};

describe('PostingRulesSubscriber — WO-19.2', () => {
  let subscriber: PostingRulesSubscriber;
  let prisma: any;
  let accounting: any;

  beforeEach(async () => {
    prisma = { order: { findUnique: jest.fn() } };
    accounting = {
      findPostedEntry: jest.fn().mockResolvedValue(null),
      accountIdsByCode: jest.fn().mockImplementation((codes: string[]) => {
        const map = new Map<string, string>();
        for (const code of codes) if (ACCOUNT_ID[code]) map.set(code, ACCOUNT_ID[code]);
        return Promise.resolve(map);
      }),
      postEntry: jest.fn().mockResolvedValue({ id: 'entry1' }),
      reverseEntry: jest.fn().mockResolvedValue({ id: 'reversal1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostingRulesSubscriber,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: accounting },
      ],
    }).compile();

    subscriber = module.get(PostingRulesSubscriber);
  });

  describe('onOrderPlaced', () => {
    const payload = {
      orderId: 'o1',
      orderNumber: 'YSN-2026-0001',
      userId: null,
      customerName: 'Sana',
      customerPhone: null,
      customerEmail: null,
      grandTotal: 1100,
      placedAt: '2026-01-01T00:00:00.000Z',
      stitchingItemIds: [],
    };

    it('posts Dr AR / Cr Revenue / Cr Tax and Dr COGS / Cr Inventory, balanced', async () => {
      prisma.order.findUnique.mockResolvedValue({
        grandTotal: 1100,
        taxAmount: 100,
        placedAt: new Date('2026-01-01'),
        items: [{ unitCost: 300, quantity: 2 }],
      });

      await subscriber.onOrderPlaced(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: DomainEvent.OrderPlaced,
          sourceRef: 'o1',
          lines: [
            { accountId: 'acc-ar', debitMinor: 1100 },
            { accountId: 'acc-revenue', creditMinor: 1000 },
            { accountId: 'acc-tax', creditMinor: 100 },
            { accountId: 'acc-cogs', debitMinor: 600 },
            { accountId: 'acc-inventory', creditMinor: 600 },
          ],
        }),
      );
    });

    it('tags the AR line with the order’s contactId, for Aged Receivables (WO-19.4) to group by customer', async () => {
      prisma.order.findUnique.mockResolvedValue({
        grandTotal: 1000,
        taxAmount: 0,
        placedAt: new Date('2026-01-01'),
        contactId: 'contact1',
        items: [],
      });

      await subscriber.onOrderPlaced(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { accountId: 'acc-ar', debitMinor: 1000, contactId: 'contact1' },
            { accountId: 'acc-revenue', creditMinor: 1000 },
          ],
        }),
      );
    });

    it('omits the tax line when taxAmount is 0, and the COGS/Inventory lines when there is no cost', async () => {
      prisma.order.findUnique.mockResolvedValue({
        grandTotal: 1000,
        taxAmount: 0,
        placedAt: new Date('2026-01-01'),
        items: [{ unitCost: 0, quantity: 1 }],
      });

      await subscriber.onOrderPlaced(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { accountId: 'acc-ar', debitMinor: 1000 },
            { accountId: 'acc-revenue', creditMinor: 1000 },
          ],
        }),
      );
    });

    it('does nothing when an entry for this order is already POSTED (redelivery)', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'already-there' });

      await subscriber.onOrderPlaced(payload);

      expect(prisma.order.findUnique).not.toHaveBeenCalled();
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('skips without throwing when the order no longer exists', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(subscriber.onOrderPlaced(payload)).resolves.toBeUndefined();
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onPaymentSucceeded', () => {
    const payload = { paymentId: 'p1', orderId: 'o1', provider: 'cod', amount: 1100, status: 'PAID' };

    it('posts Dr Cash & Bank / Cr Accounts Receivable', async () => {
      await subscriber.onPaymentSucceeded(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: DomainEvent.PaymentSucceeded,
          sourceRef: 'p1',
          lines: [
            { accountId: 'acc-bank', debitMinor: 1100 },
            { accountId: 'acc-ar', creditMinor: 1100 },
          ],
        }),
      );
    });

    it('does nothing for a zero or negative amount', async () => {
      await subscriber.onPaymentSucceeded({ ...payload, amount: 0 });
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('does nothing when this payment already posted a receipt (redelivery)', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'already-there' });

      await subscriber.onPaymentSucceeded(payload);

      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onPaymentRefunded', () => {
    const payload = { paymentId: 'p1', orderId: 'o1', provider: 'cod', amount: 1100 };

    it('reverses both the receipt and the sale entry', async () => {
      accounting.findPostedEntry.mockImplementation((source: string) =>
        Promise.resolve(source === DomainEvent.PaymentSucceeded ? { id: 'receipt1' } : { id: 'sale1' }),
      );

      await subscriber.onPaymentRefunded(payload);

      expect(accounting.reverseEntry).toHaveBeenCalledWith('receipt1', expect.any(String));
      expect(accounting.reverseEntry).toHaveBeenCalledWith('sale1', expect.any(String));
    });

    it('reverses only whichever entry is still POSTED', async () => {
      accounting.findPostedEntry.mockImplementation((source: string) =>
        Promise.resolve(source === DomainEvent.PaymentSucceeded ? { id: 'receipt1' } : null),
      );

      await subscriber.onPaymentRefunded(payload);

      expect(accounting.reverseEntry).toHaveBeenCalledTimes(1);
      expect(accounting.reverseEntry).toHaveBeenCalledWith('receipt1', expect.any(String));
    });

    it('reverses nothing when neither entry is POSTED', async () => {
      accounting.findPostedEntry.mockResolvedValue(null);

      await expect(subscriber.onPaymentRefunded(payload)).resolves.toBeUndefined();
      expect(accounting.reverseEntry).not.toHaveBeenCalled();
    });
  });

  describe('onSupplierBillRaised — WO-19.3', () => {
    const payload = {
      billId: 'bill1',
      supplierId: 'sup1',
      purchaseOrderId: null,
      amountMinor: 100_000,
      currency: 'USD',
      fxRateScaled: 280_500_000,
      baseAmountMinor: 28_050_000,
      issuedAt: '2026-01-01T00:00:00.000Z',
    };

    it('posts Dr Inventory / Cr Accounts Payable at baseAmountMinor, tagging the AP line with the bill currency', async () => {
      await subscriber.onSupplierBillRaised(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: DomainEvent.SupplierBillRaised,
          sourceRef: 'bill1',
          lines: [
            { accountId: 'acc-inventory', debitMinor: 28_050_000 },
            {
              accountId: 'acc-ap',
              creditMinor: 28_050_000,
              currency: 'USD',
              fxRateScaled: 280_500_000,
              baseAmountMinor: 28_050_000,
              supplierId: 'sup1',
            },
          ],
        }),
      );
    });

    it('does nothing when this bill already posted (redelivery)', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'already-there' });

      await subscriber.onSupplierBillRaised(payload);

      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('does nothing for a zero base amount', async () => {
      await subscriber.onSupplierBillRaised({ ...payload, baseAmountMinor: 0 });
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onSupplierBillPaid — WO-19.3 realised FX gain/loss', () => {
    const basePayload = {
      billId: 'bill1',
      supplierId: 'sup1',
      amountMinor: 100_000,
      currency: 'USD',
      paidAt: '2026-01-15T00:00:00.000Z',
    };

    it('posts a realised FX LOSS when the settlement rate is higher than the booked rate (paying more base currency than booked)', async () => {
      await subscriber.onSupplierBillPaid({
        ...basePayload,
        billFxRateScaled: 280_000_000,
        settlementFxRateScaled: 282_000_000,
      });

      // booked: 100_000 * 280 / 1e6 = 28,000,000 ; paid: 100_000 * 282 / 1e6 = 28,200,000 ; diff = +200,000 (loss)
      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: DomainEvent.SupplierBillPaid,
          lines: [
            { accountId: 'acc-ap', debitMinor: 28_000_000, supplierId: 'sup1' },
            { accountId: 'acc-bank', creditMinor: 28_200_000 },
            { accountId: 'acc-fx-loss', debitMinor: 200_000 },
          ],
        }),
      );
    });

    it('posts a realised FX GAIN when the settlement rate is lower than the booked rate', async () => {
      await subscriber.onSupplierBillPaid({
        ...basePayload,
        billFxRateScaled: 280_000_000,
        settlementFxRateScaled: 278_000_000,
      });

      // booked: 28,000,000 ; paid: 27,800,000 ; diff = -200,000 (gain)
      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { accountId: 'acc-ap', debitMinor: 28_000_000, supplierId: 'sup1' },
            { accountId: 'acc-bank', creditMinor: 27_800_000 },
            { accountId: 'acc-fx-gain', creditMinor: 200_000 },
          ],
        }),
      );
    });

    it('posts no FX line at all when the settlement rate matches the booked rate exactly', async () => {
      await subscriber.onSupplierBillPaid({
        ...basePayload,
        billFxRateScaled: 280_000_000,
        settlementFxRateScaled: 280_000_000,
      });

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { accountId: 'acc-ap', debitMinor: 28_000_000, supplierId: 'sup1' },
            { accountId: 'acc-bank', creditMinor: 28_000_000 },
          ],
        }),
      );
    });

    it('is idempotent per (billId, paidAt) against outbox redelivery', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'already-there' });

      await subscriber.onSupplierBillPaid({
        ...basePayload,
        billFxRateScaled: 280_000_000,
        settlementFxRateScaled: 282_000_000,
      });

      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('does nothing for a zero or negative amount', async () => {
      await subscriber.onSupplierBillPaid({
        ...basePayload,
        amountMinor: 0,
        billFxRateScaled: 280_000_000,
        settlementFxRateScaled: 282_000_000,
      });

      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onStockVarianceRecorded — WO-21.3', () => {
    const payload = {
      stockVarianceId: 'variance1',
      variantId: 'variant1',
      locationId: 'loc1',
      overshootQty: 3,
      unitCost: 500,
    };

    it('posts Dr Inventory Shrinkage / Cr Inventory at overshootQty * unitCost', async () => {
      await subscriber.onStockVarianceRecorded(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: DomainEvent.StockVarianceRecorded,
          sourceRef: 'variance1',
          lines: [
            { accountId: 'acc-shrinkage', debitMinor: 1500 },
            { accountId: 'acc-inventory', creditMinor: 1500 },
          ],
        }),
      );
    });

    it('does nothing when unitCost is null — nothing to value the shrinkage at', async () => {
      await subscriber.onStockVarianceRecorded({ ...payload, unitCost: null });
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('does nothing when this variance already posted (redelivery)', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'already-there' });

      await subscriber.onStockVarianceRecorded(payload);

      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onInterBranchTransferInvoiced — WO-22.3', () => {
    const payload = {
      invoiceId: 'invoice1',
      invoiceNumber: 'IBI-2026-0001',
      transferId: 'transfer1',
      sourceRetailBrandId: 'brandA',
      destinationRetailBrandId: 'brandB',
      amountMinor: 5000,
      issuedAt: '2026-01-01T00:00:00.000Z',
    };

    it('posts Dr AR (source) / Cr Intercompany Revenue (source, counterparty=dest) / Dr Intercompany COGS (dest, counterparty=source) / Cr AP (dest), balanced', async () => {
      await subscriber.onInterBranchTransferInvoiced(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: DomainEvent.InterBranchTransferInvoiced,
          sourceRef: 'invoice1',
          lines: [
            { accountId: 'acc-ar', debitMinor: 5000, retailBrandId: 'brandA' },
            { accountId: 'acc-ic-revenue', creditMinor: 5000, retailBrandId: 'brandA', counterpartyBrandId: 'brandB' },
            { accountId: 'acc-ic-cogs', debitMinor: 5000, retailBrandId: 'brandB', counterpartyBrandId: 'brandA' },
            { accountId: 'acc-ap', creditMinor: 5000, retailBrandId: 'brandB' },
          ],
        }),
      );
    });

    it('does nothing for a zero or negative amount', async () => {
      await subscriber.onInterBranchTransferInvoiced({ ...payload, amountMinor: 0 });
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('does nothing when this invoice already posted (redelivery)', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'already-there' });

      await subscriber.onInterBranchTransferInvoiced(payload);

      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onExpenseRecorded — WO-23.1', () => {
    const payload = {
      expenseId: 'e1',
      categoryKey: 'rent',
      isDirect: false,
      amountMinor: 5000,
      incurredAt: '2026-10-05T00:00:00.000Z',
      paidAtIso: null as string | null,
      supplierId: null as string | null,
      scopeLevel: 'BRAND' as const,
      originNodeId: null as string | null,
    };

    it('Dr Operating Expenses / Cr Accounts Payable when unpaid', async () => {
      await subscriber.onExpenseRecorded(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: DomainEvent.ExpenseRecorded,
          sourceRef: 'e1',
          lines: [
            { accountId: 'acc-operating-expenses', debitMinor: 5000 },
            { accountId: 'acc-ap', creditMinor: 5000, supplierId: null },
          ],
        }),
      );
    });

    it('Dr Direct Expenses / Cr Cash & Bank when isDirect and already paid', async () => {
      await subscriber.onExpenseRecorded({
        ...payload,
        isDirect: true,
        paidAtIso: '2026-10-06T00:00:00.000Z',
      });

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { accountId: 'acc-direct-expenses', debitMinor: 5000 },
            { accountId: 'acc-bank', creditMinor: 5000, supplierId: null },
          ],
        }),
      );
    });

    it('tags the Accounts Payable line with supplierId only while unpaid — a paid line carries no supplier tag to age', async () => {
      await subscriber.onExpenseRecorded({ ...payload, supplierId: 's1' });

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { accountId: 'acc-operating-expenses', debitMinor: 5000 },
            { accountId: 'acc-ap', creditMinor: 5000, supplierId: 's1' },
          ],
        }),
      );
    });

    it('does nothing for a zero or negative amount', async () => {
      await subscriber.onExpenseRecorded({ ...payload, amountMinor: 0 });
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('does nothing when this expense already posted (redelivery)', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'already-there' });

      await subscriber.onExpenseRecorded(payload);

      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onPayrollRunPosted — WO-19.4', () => {
    const payload = {
      payRunId: 'pr1',
      number: 'PAY-2026-0001',
      postedAt: '2026-10-05T00:00:00.000Z',
      grossMinor: 100_000,
      netMinor: 80_000,
      deductionsMinor: 15_000,
      scopeLevel: 'BRAND' as const,
      originNodeId: null as string | null,
    };

    it('Dr Salaries & Wages Expense (net + deductions, not the full theoretical gross) / Cr Tax Payable / Cr Salaries Payable', async () => {
      await subscriber.onPayrollRunPosted(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: DomainEvent.PayrollRunPosted,
          sourceRef: 'pr1',
          lines: [
            { accountId: 'acc-salaries-expense', debitMinor: 95_000 },
            { accountId: 'acc-tax', creditMinor: 15_000 },
            { accountId: 'acc-salaries-payable', creditMinor: 80_000 },
          ],
        }),
      );
    });

    it('balances even when unpaid leave shrank the run below its theoretical gross', async () => {
      // grossMinor here is the pre-deduction theoretical figure; net+deductions
      // (what onPayrollRunPosted actually debits) is what unpaid leave left.
      await subscriber.onPayrollRunPosted({ ...payload, grossMinor: 200_000, netMinor: 60_000, deductionsMinor: 10_000 });

      const call = accounting.postEntry.mock.calls[0][0];
      const totalDebit = call.lines.reduce((sum: number, l: { debitMinor?: number }) => sum + (l.debitMinor ?? 0), 0);
      const totalCredit = call.lines.reduce((sum: number, l: { creditMinor?: number }) => sum + (l.creditMinor ?? 0), 0);
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBe(70_000);
    });

    it('omits the Tax Payable line entirely when there are no deductions', async () => {
      await subscriber.onPayrollRunPosted({ ...payload, deductionsMinor: 0, netMinor: 100_000 });

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { accountId: 'acc-salaries-expense', debitMinor: 100_000 },
            { accountId: 'acc-salaries-payable', creditMinor: 100_000 },
          ],
        }),
      );
    });

    it('does nothing when net + deductions is zero or negative', async () => {
      await subscriber.onPayrollRunPosted({ ...payload, netMinor: 0, deductionsMinor: 0 });
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('does nothing when this pay run already posted (redelivery)', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'already-there' });

      await subscriber.onPayrollRunPosted(payload);

      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onPayrollAdjustmentPosted — WO-19.5', () => {
    const payload = {
      adjustmentId: 'adj1',
      payRunId: 'pr1',
      payRunNumber: 'PAY-2026-0001',
      userId: 'u1',
      reason: 'OVERPAYMENT' as const,
      amountMinor: 500_00,
      postedAt: '2026-11-01T00:00:00.000Z',
    };

    it('Dr Employee Advances / Cr Salaries Payable for OVERPAYMENT', async () => {
      await subscriber.onPayrollAdjustmentPosted(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: DomainEvent.PayrollAdjustmentPosted,
          sourceRef: 'adj1',
          lines: [
            { accountId: 'acc-advances', debitMinor: 500_00 },
            { accountId: 'acc-salaries-payable', creditMinor: 500_00 },
          ],
        }),
      );
    });

    it('Dr Salaries & Wages Expense / Cr Salaries Payable for UNDERPAYMENT', async () => {
      await subscriber.onPayrollAdjustmentPosted({ ...payload, reason: 'UNDERPAYMENT' });

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { accountId: 'acc-salaries-expense', debitMinor: 500_00 },
            { accountId: 'acc-salaries-payable', creditMinor: 500_00 },
          ],
        }),
      );
    });

    it('Dr Salaries & Wages Expense / Cr Salaries Payable for CORRECTION', async () => {
      await subscriber.onPayrollAdjustmentPosted({ ...payload, reason: 'CORRECTION' });

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { accountId: 'acc-salaries-expense', debitMinor: 500_00 },
            { accountId: 'acc-salaries-payable', creditMinor: 500_00 },
          ],
        }),
      );
    });

    it('sourceRef is the adjustment id, never the original pay run id', async () => {
      await subscriber.onPayrollAdjustmentPosted(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({ sourceRef: 'adj1' }),
      );
    });

    it('does nothing when this adjustment already posted (redelivery)', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'already-there' });

      await subscriber.onPayrollAdjustmentPosted(payload);

      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  // 145-receivables-credit-limits-dunning.md (WO-145.2)
  describe('onCreditNoteIssued', () => {
    const payload = {
      creditNoteId: 'cn1',
      customerId: 'contact1',
      orderId: 'order1',
      amountMinor: 500,
      issuedAt: '2026-02-01T00:00:00.000Z',
    };

    it('Dr Sales Returns / Cr Accounts Receivable, tagged with the customer', async () => {
      await subscriber.onCreditNoteIssued(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: DomainEvent.CreditNoteIssued,
          sourceRef: 'cn1',
          lines: [
            { accountId: 'acc-sales-returns', debitMinor: 500 },
            { accountId: 'acc-ar', creditMinor: 500, contactId: 'contact1' },
          ],
        }),
      );
    });

    it('is idempotent — does nothing once already posted (outbox redelivery)', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'already-there' });

      await subscriber.onCreditNoteIssued(payload);

      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('never posts a zero or negative amount', async () => {
      await subscriber.onCreditNoteIssued({ ...payload, amountMinor: 0 });
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onCreditNoteVoided', () => {
    it('reverses the CreditNoteIssued entry', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'entry-cn1' });

      await subscriber.onCreditNoteVoided({ creditNoteId: 'cn1' });

      expect(accounting.findPostedEntry).toHaveBeenCalledWith(DomainEvent.CreditNoteIssued, 'cn1');
      expect(accounting.reverseEntry).toHaveBeenCalledWith('entry-cn1', expect.stringContaining('cn1'));
    });

    it('does nothing when no posted entry exists (accounting was off when it issued)', async () => {
      accounting.findPostedEntry.mockResolvedValue(null);

      await subscriber.onCreditNoteVoided({ creditNoteId: 'cn1' });

      expect(accounting.reverseEntry).not.toHaveBeenCalled();
    });
  });

  describe('onDebitNoteIssued', () => {
    const payload = {
      debitNoteId: 'dn1',
      supplierId: 'supplier1',
      supplierBillId: 'bill1',
      amountMinor: 300,
      issuedAt: '2026-02-01T00:00:00.000Z',
    };

    it('Dr Accounts Payable / Cr Purchase Returns, tagged with the supplier', async () => {
      await subscriber.onDebitNoteIssued(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: DomainEvent.DebitNoteIssued,
          sourceRef: 'dn1',
          lines: [
            { accountId: 'acc-ap', debitMinor: 300, supplierId: 'supplier1' },
            { accountId: 'acc-purchase-returns', creditMinor: 300 },
          ],
        }),
      );
    });

    it('is idempotent — does nothing once already posted', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'already-there' });

      await subscriber.onDebitNoteIssued(payload);

      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onSettlementShortfallWrittenOff', () => {
    const payload = {
      batchId: 'batch1',
      shortfallMinor: 300,
      writtenOffAt: '2026-09-25T00:00:00.000Z',
    };

    it('debits Settlement Shortfall Expense and credits Cash & Bank for the shortfall amount', async () => {
      await subscriber.onSettlementShortfallWrittenOff(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: DomainEvent.SettlementShortfallWrittenOff,
          sourceRef: 'batch1',
          lines: [
            { accountId: 'acc-settlement-shortfall', debitMinor: 300 },
            { accountId: 'acc-bank', creditMinor: 300 },
          ],
        }),
      );
    });

    it('is idempotent — does not repost when a POSTED entry already exists for this batch', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'entry-existing' });

      await subscriber.onSettlementShortfallWrittenOff(payload);

      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('never posts a zero or negative shortfall', async () => {
      await subscriber.onSettlementShortfallWrittenOff({ ...payload, shortfallMinor: 0 });
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('logs and skips rather than throwing when the chart of accounts is missing an account', async () => {
      accounting.accountIdsByCode.mockResolvedValue(new Map());

      await expect(subscriber.onSettlementShortfallWrittenOff(payload)).resolves.toBeUndefined();
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onDebitNoteVoided', () => {
    it('reverses the DebitNoteIssued entry', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'entry-dn1' });

      await subscriber.onDebitNoteVoided({ debitNoteId: 'dn1' });

      expect(accounting.reverseEntry).toHaveBeenCalledWith('entry-dn1', expect.stringContaining('dn1'));
    });
  });
});
