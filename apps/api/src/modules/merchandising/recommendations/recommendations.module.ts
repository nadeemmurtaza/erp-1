import { Module } from '@nestjs/common';
import {
  CrossSellAdminController,
  PersonalizedRecommendationsController,
  RecommendationsController,
} from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsCron } from './recommendations.cron';

@Module({
  controllers: [RecommendationsController, PersonalizedRecommendationsController, CrossSellAdminController],
  providers: [RecommendationsService, RecommendationsCron],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
