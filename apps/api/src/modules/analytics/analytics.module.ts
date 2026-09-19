import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { SupplyChainDigestCron } from './supply-chain-digest.cron';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SupplyChainDigestCron],
})
export class AnalyticsModule {}
