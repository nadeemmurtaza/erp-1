import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DomainEvent } from '../../core/events/domain-events';
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
});
