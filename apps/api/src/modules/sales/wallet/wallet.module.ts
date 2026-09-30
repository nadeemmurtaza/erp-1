import { Module } from '@nestjs/common';
import { WalletAccountController } from './wallet-account.controller';
import { WalletAdminController } from './wallet-admin.controller';
import { MerchantPayableController } from './merchant-payable.controller';
import { WalletService } from './wallet.service';
import { MerchantPayableService } from './merchant-payable.service';
import { CREDIT_NOTE_SERVICE, MerchantPayableAdjustmentCreditNoteService } from './wallet-credit-note.port';

/**
 * 155-wallet-stored-value-merchant-escrow.md.
 *
 * SHIPS OFF BY DEFAULT. This module is registered in modules.registry.ts
 * (`offByDefault: true`) but enabled in no deployment's MODULES today — see
 * DECISIONS.md's "Wallet module: built in full, shipped module-off pending
 * WO-155.0" entry. The schema, both services and every method below are
 * complete and directly tested (wallet.service.spec.ts,
 * merchant-payable.service.spec.ts); what is deliberately NOT done is
 * flipping MODULES and wiring `placeOrderWithWalletCredit()` into the live
 * checkout path (orders.service.ts / cart) as an active payment option —
 * that connection point is named, not built, pending WO-155.0's own legal
 * confirmation that the store credit as designed is genuinely closed-loop
 * and the merchant agreement documents Newax's own buyer/facilitator role.
 *
 * `CREDIT_NOTE_SERVICE` binds to `MerchantPayableAdjustmentCreditNoteService`
 * — the interim, accounting-equivalent default `WalletService.refund()`'s
 * REDEEM branch uses because `apps/api/prisma/schema/invoicing.prisma` had
 * no `CreditNote`/`DebitNote` model when this module was built (checked
 * directly). Rebind this provider to a `CreditNote`-backed implementation
 * once doc 145 ships — see wallet-credit-note.port.ts.
 */
@Module({
  controllers: [WalletAccountController, WalletAdminController, MerchantPayableController],
  providers: [
    WalletService,
    MerchantPayableService,
    { provide: CREDIT_NOTE_SERVICE, useClass: MerchantPayableAdjustmentCreditNoteService },
  ],
  exports: [WalletService, MerchantPayableService],
})
export class WalletModule {}
