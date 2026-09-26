import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { OrdersModule } from '../orders/orders.module';
import { AccountsService } from './accounts.service';
import { B2BAccountsAdminController, B2BAccountsController } from './accounts.controller';

/**
 * 149-b2b-accounts-approvals-sector-packs.md. Off by default in MODULES
 * (modules.registry.ts) — same tier as settlements/wallet/transfers: a
 * Solo/simple deployment has no B2B buyers to open an account for, and with
 * it off, checkout is byte-identical to today (this doc's own Acceptance
 * criterion #1). AccountProvider (payments/providers/account.provider.ts)
 * needs neither this module nor its allowlist entry — it reads B2BAccount/
 * B2BPurchaseApprovalPolicy directly via Prisma, the same cross-module read
 * `reports.service.ts` already does elsewhere, so "pay on account" at
 * checkout keeps working even if a deployment somehow enables the payment
 * key without this module — it just has no staff/portal UI to manage it.
 *
 * `accounts -> orders` (KNOWN_MODULE_COUPLINGS): convertToOrder() hands an
 * approved request to OrdersService.place() itself, the same "a channel
 * that funnels into the normal order-creation path" reasoning `pos ->
 * orders` already establishes — not a same-transaction write (place() runs
 * its own, separate transaction, sequentially after the approval already
 * committed).
 */
@Module({
  imports: [PricingModule, OrdersModule],
  controllers: [B2BAccountsAdminController, B2BAccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
