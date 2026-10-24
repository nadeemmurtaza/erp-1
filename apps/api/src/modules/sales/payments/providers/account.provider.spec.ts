import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccountProvider } from './account.provider';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { CreditTermsService } from '../../../money/receivables/credit-terms.service';
import type { PaymentContext } from '../payment-provider';

describe('AccountProvider — 149-b2b-accounts-approvals-sector-packs.md', () => {
  let provider: AccountProvider;
  let prisma: any;
  let creditTerms: any;

  const context: PaymentContext = {
    orderId: 'order1',
    orderNumber: 'ORD-1',
    amount: 10_000,
    customerName: 'Buyer',
    customerPhone: null,
    customerEmail: null,
    contactId: 'contact1',
  };

  beforeEach(() => {
    prisma = {
      b2BAccount: { findUnique: jest.fn() },
      b2BPurchaseApprovalPolicy: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    creditTerms = { checkCreditAvailable: jest.fn().mockResolvedValue({ allowed: true, availableMinor: 1_000_000 }) };
    provider = new AccountProvider(prisma as PrismaService, creditTerms as CreditTermsService);
  });

  it('refuses a guest with no contactId — the same behavior a deployment with the pack off already has', async () => {
    await expect(provider.initiate({ ...context, contactId: null })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.b2BAccount.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a buyer with no B2BAccount at all — checkout is byte-identical to today with the pack off', async () => {
    prisma.b2BAccount.findUnique.mockResolvedValue(null);

    await expect(provider.initiate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an inactive account', async () => {
    prisma.b2BAccount.findUnique.mockResolvedValue({ id: 'acct1', isActive: false });

    await expect(provider.initiate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses when a purchase-order reference is required but missing', async () => {
    prisma.b2BAccount.findUnique.mockResolvedValue({ id: 'acct1', isActive: true, requiresPurchaseOrder: true });

    await expect(provider.initiate({ ...context, purchaseOrderReference: null })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reuses CreditTermsService.checkCreditAvailable() unchanged, and refuses over the limit', async () => {
    prisma.b2BAccount.findUnique.mockResolvedValue({ id: 'acct1', isActive: true, requiresPurchaseOrder: false });
    creditTerms.checkCreditAvailable.mockResolvedValue({ allowed: false, availableMinor: 0, reason: 'over the limit' });

    await expect(provider.initiate(context)).rejects.toBeInstanceOf(BadRequestException);
    expect(creditTerms.checkCreditAvailable).toHaveBeenCalledWith('contact1', 10_000);
  });

  it('refuses at or above the account\'s own approval threshold — the generic checkout endpoint never completes it', async () => {
    prisma.b2BAccount.findUnique.mockResolvedValue({ id: 'acct1', isActive: true, requiresPurchaseOrder: false });
    prisma.b2BPurchaseApprovalPolicy.findUnique.mockResolvedValue({ thresholdMinor: 10_000 });

    await expect(provider.initiate(context)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('succeeds PENDING for an active account under its threshold — settles later like any other unpaid method', async () => {
    prisma.b2BAccount.findUnique.mockResolvedValue({ id: 'acct1', isActive: true, requiresPurchaseOrder: false });
    prisma.b2BPurchaseApprovalPolicy.findUnique.mockResolvedValue({ thresholdMinor: 50_000 });

    const result = await provider.initiate(context);

    expect(result).toEqual(
      expect.objectContaining({ status: 'PENDING', redirectUrl: null, reference: 'ACCT-ORD-1' }),
    );
  });
});
