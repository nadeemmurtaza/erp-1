import { Test, TestingModule } from '@nestjs/testing';
import { AccountingService } from './accounting.service';
import { WalletPostingRulesSubscriber } from './wallet-posting-rules.subscriber';
import { ACCOUNT_CODE } from './chart-of-accounts';

const ACCOUNT_ID: Record<string, string> = {
  [ACCOUNT_CODE.CASH_AND_BANK]: 'acc-bank',
  [ACCOUNT_CODE.DEFERRED_REVENUE_WALLET]: 'acc-deferred',
  [ACCOUNT_CODE.SALES_REVENUE]: 'acc-revenue',
  [ACCOUNT_CODE.COGS]: 'acc-cogs',
  [ACCOUNT_CODE.ACCOUNTS_PAYABLE]: 'acc-ap',
};

describe('WalletPostingRulesSubscriber — doc 155 §3', () => {
  let subscriber: WalletPostingRulesSubscriber;
  let accounting: any;

  beforeEach(async () => {
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
      providers: [WalletPostingRulesSubscriber, { provide: AccountingService, useValue: accounting }],
    }).compile();

    subscriber = module.get(WalletPostingRulesSubscriber);
  });

  describe('onWalletCreditPurchased', () => {
    const payload = { walletAccountId: 'w1', customerId: 'cust1', paymentId: 'pay1', amountMinor: 5_000, currency: 'PKR' };

    it('posts Dr Cash & Bank · Cr Deferred Revenue', async () => {
      await subscriber.onWalletCreditPurchased(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'wallet.credit_purchased',
          sourceRef: 'pay1',
          lines: [
            { accountId: 'acc-bank', debitMinor: 5_000, contactId: 'cust1' },
            { accountId: 'acc-deferred', creditMinor: 5_000, contactId: 'cust1' },
          ],
        }),
      );
    });

    it('is idempotent — skips when an entry already posted for this paymentId', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'existing' });
      await subscriber.onWalletCreditPurchased(payload);
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });

    it('skips a non-positive amount', async () => {
      await subscriber.onWalletCreditPurchased({ ...payload, amountMinor: 0 });
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onWalletCreditRedeemed', () => {
    const payload = {
      walletAccountId: 'w1',
      customerId: 'cust1',
      orderId: 'order1',
      amountMinor: 10_000,
      merchantPayableId: 'payable1',
      merchantOrganizationId: 'merchantOrg1',
    };

    it('posts the revenue-recognition entry AND the merchant-payable entry', async () => {
      await subscriber.onWalletCreditRedeemed(payload);

      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'wallet.credit_redeemed',
          sourceRef: 'order1',
          lines: [
            { accountId: 'acc-deferred', debitMinor: 10_000, contactId: 'cust1' },
            { accountId: 'acc-revenue', creditMinor: 10_000 },
          ],
        }),
      );
      expect(accounting.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'wallet.merchant_payable_created',
          sourceRef: 'payable1',
          lines: [
            { accountId: 'acc-cogs', debitMinor: 10_000 },
            { accountId: 'acc-ap', creditMinor: 10_000 },
          ],
        }),
      );
      expect(accounting.postEntry).toHaveBeenCalledTimes(2);
    });

    it('is idempotent on the redemption half', async () => {
      accounting.findPostedEntry.mockImplementation((source: string) =>
        source === 'wallet.credit_redeemed' ? Promise.resolve({ id: 'existing' }) : Promise.resolve(null),
      );
      await subscriber.onWalletCreditRedeemed(payload);
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });

  describe('onWalletCreditRefunded', () => {
    it('reverses the original PURCHASE entry', async () => {
      accounting.findPostedEntry.mockResolvedValue({ id: 'purchase-entry-1' });
      await subscriber.onWalletCreditRefunded({
        walletAccountId: 'w1',
        customerId: 'cust1',
        reversalOf: 'PURCHASE',
        orderId: null,
        paymentId: 'pay1',
        amountMinor: 5_000,
      });
      expect(accounting.reverseEntry).toHaveBeenCalledWith('purchase-entry-1', expect.stringContaining('pay1'));
    });

    it('never posts anything for a REDEEM-side refund — that correction is the CreditNote port\'s job', async () => {
      await subscriber.onWalletCreditRefunded({
        walletAccountId: 'w1',
        customerId: 'cust1',
        reversalOf: 'REDEEM',
        orderId: 'order1',
        paymentId: null,
        amountMinor: 2_000,
      });
      expect(accounting.reverseEntry).not.toHaveBeenCalled();
      expect(accounting.postEntry).not.toHaveBeenCalled();
    });
  });
});
