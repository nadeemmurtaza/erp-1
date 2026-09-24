import { Module } from '@nestjs/common';
import { GiftCardsController, StoreCreditController } from './giftcards.controller';
import { GiftCardsAccountController } from './giftcards-account.controller';
import { GiftCardsService } from './giftcards.service';
import { StoreCreditService } from './store-credit.service';
import { StoreCreditReconcileCron } from './store-credit-reconcile.cron';

@Module({
  controllers: [GiftCardsController, StoreCreditController, GiftCardsAccountController],
  providers: [GiftCardsService, StoreCreditService, StoreCreditReconcileCron],
  exports: [GiftCardsService, StoreCreditService],
})
export class GiftCardsModule {}
