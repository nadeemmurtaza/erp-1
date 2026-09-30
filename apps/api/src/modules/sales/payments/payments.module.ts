import { Module } from '@nestjs/common';
import { ReceivablesModule } from '../../money/receivables/receivables.module';
import { PaymentNotificationSubscriber } from './notification.subscriber';
import { PaymentsAdminController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { AccountProvider } from './providers/account.provider';
import { BankTransferProvider } from './providers/bank-transfer.provider';
import { CodProvider } from './providers/cod.provider';
import { EasypaisaProvider } from './providers/easypaisa.provider';
import { GiftkartaProvider } from './providers/giftkarta.provider';
import { JazzCashProvider } from './providers/jazzcash.provider';
import { PaymentFeedSource } from './payment-feed.source';

@Module({
  // Hard-imported the same way orders.module.ts imports TaxModule/
  // PricingModule/FulfilmentModule (149-b2b-accounts-approvals-sector-
  // packs.md): AccountProvider.initiate() needs CreditTermsService.
  // checkCreditAvailable() before checkout can commit — a pure read, the
  // same "checkout cannot commit without this number" reasoning as
  // `orders -> tax`/`cart -> pricing` (KNOWN_MODULE_COUPLINGS). Only
  // `receivables`'s own admin nav/UI stays gated by the MODULES allowlist.
  imports: [ReceivablesModule],
  controllers: [PaymentsController, PaymentsAdminController],
  providers: [
    PaymentsService,
    CodProvider,
    BankTransferProvider,
    JazzCashProvider,
    EasypaisaProvider,
    GiftkartaProvider,
    AccountProvider,
    PaymentNotificationSubscriber,
    PaymentFeedSource,
  ],
  // Exported for the orders module, which creates the payment with the order.
  exports: [PaymentsService],
})
export class PaymentsModule {}
