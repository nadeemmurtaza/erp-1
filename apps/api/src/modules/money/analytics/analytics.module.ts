import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { SupplyChainDigestCron } from './supply-chain-digest.cron';
import {
  CustomersMetricsProvider,
  OrdersMetricsProvider,
  ProductsMetricsProvider,
  SalesCostMetricsProvider,
  SalesMetricsProvider,
  WorkshopMetricsProvider,
  WorkshopStaffMetricsProvider,
} from './analytics.metrics';

@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    SupplyChainDigestCron,
    SalesMetricsProvider,
    SalesCostMetricsProvider,
    OrdersMetricsProvider,
    ProductsMetricsProvider,
    CustomersMetricsProvider,
    WorkshopMetricsProvider,
    WorkshopStaffMetricsProvider,
  ],
})
export class AnalyticsModule {}
