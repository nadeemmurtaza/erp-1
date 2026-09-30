import { Module } from '@nestjs/common';
import { GiftCardsModule } from '../giftcards/giftcards.module';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyAdminController } from './loyalty-admin.controller';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyOrderListener } from './loyalty-order.listener';

@Module({
  imports: [GiftCardsModule],
  controllers: [LoyaltyController, LoyaltyAdminController],
  providers: [LoyaltyService, LoyaltyOrderListener],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
