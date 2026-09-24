import { Module } from '@nestjs/common';
import { PaymentNotificationSubscriber } from './notification.subscriber';
import { PaymentsAdminController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { BankTransferProvider } from './providers/bank-transfer.provider';
import { CodProvider } from './providers/cod.provider';
import { EasypaisaProvider } from './providers/easypaisa.provider';
import { GiftkartaProvider } from './providers/giftkarta.provider';
import { JazzCashProvider } from './providers/jazzcash.provider';

@Module({
  controllers: [PaymentsController, PaymentsAdminController],
  providers: [
    PaymentsService,
    CodProvider,
    BankTransferProvider,
    JazzCashProvider,
    EasypaisaProvider,
    GiftkartaProvider,
    PaymentNotificationSubscriber,
  ],
  // Exported for the orders module, which creates the payment with the order.
  exports: [PaymentsService],
})
export class PaymentsModule {}
