import { Module } from '@nestjs/common';
import { PromotionsController } from './promotions.controller';
import { PromotionsPublicController } from './promotions-public.controller';
import { PromotionsService } from './promotions.service';

@Module({
  controllers: [PromotionsController, PromotionsPublicController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
