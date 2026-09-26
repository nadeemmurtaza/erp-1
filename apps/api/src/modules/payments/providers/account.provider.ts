import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { CreditTermsService } from '../../receivables/credit-terms.service';
import type {
  PaymentContext,
  PaymentInitiation,
  PaymentProvider,
} from '../payment-provider';

/**
 * "Pay on account" — 149-b2b-accounts-approvals-sector-packs.md. Not a new
 * payment mechanism, the ABSENCE of one at order time: the order posts as an
 * outstanding receivable through the identical OrderPlaced posting rule
 * every order already uses (posting-rules.subscriber.ts always posts to AR
 * regardless of payment method), and settles later through the identical
 * PaymentsService.approve() every COD/bank-transfer payment already uses —
 * no bespoke settlement path exists here.
 *
 * Off by default: absent from PAYMENT_PROVIDERS until a deployment adds
 * `account` to it, at which point a buyer still needs an active B2BAccount
 * to ever see it succeed — with neither, checkout is byte-identical to
 * today (this doc's own Acceptance criterion #1).
 */
@Injectable()
export class AccountProvider implements PaymentProvider {
  readonly key = 'account';
  readonly labelEn = 'Pay on account';
  readonly labelUr = 'اکاؤنٹ پر ادائیگی';
  readonly descriptionEn = 'Bill this order to your standing account, under your agreed credit terms.';
  readonly descriptionUr = 'یہ آرڈر آپ کے طے شدہ کریڈٹ اکاؤنٹ پر بل کیا جائے گا۔';

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditTerms: CreditTermsService,
  ) {}

  async feeFor(): Promise<number> {
    return 0;
  }

  async initiate(context: PaymentContext): Promise<PaymentInitiation> {
    if (!context.contactId) {
      throw new BadRequestException('Pay on account requires a signed-in buyer with a linked account.');
    }

    const account = await this.prisma.b2BAccount.findUnique({ where: { customerId: context.contactId } });
    if (!account || !account.isActive) {
      throw new ForbiddenException('This buyer does not have an active account for on-account orders.');
    }
    if (account.requiresPurchaseOrder && !context.purchaseOrderReference?.trim()) {
      throw new BadRequestException('This account requires a purchase order reference on every order.');
    }

    // 145-receivables-credit-limits-dunning.md's own dry run, reused
    // unchanged — never a second, parallel credit calculation.
    const availability = await this.creditTerms.checkCreditAvailable(context.contactId, context.amount);
    if (!availability.allowed) {
      throw new BadRequestException(availability.reason ?? 'This order exceeds the available credit on this account.');
    }

    // The generic checkout endpoint never completes an order at or above the
    // account's own approval threshold — that path only exists through the
    // buyer's own pending-approval request (AccountsService.submitOrderRequest),
    // which calls OrdersService.place() itself only once approved, at which
    // point no policy row blocks it a second time.
    const policy = await this.prisma.b2BPurchaseApprovalPolicy.findUnique({ where: { b2bAccountId: account.id } });
    if (policy && context.amount >= policy.thresholdMinor) {
      throw new BadRequestException(
        'This order is at or above your account’s approval threshold. Submit it for approval instead of checking out directly.',
      );
    }

    return {
      // Mirrors CodProvider: nothing has been collected yet. Staff (or the
      // buyer's own settlement) marks it PAID later through the identical
      // PaymentsService.approve() every other unpaid method already uses.
      status: 'PENDING',
      reference: `ACCT-${context.orderNumber}`,
      redirectUrl: null,
    };
  }
}
