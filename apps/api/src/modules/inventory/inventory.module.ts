import { Module } from '@nestjs/common';
import { InventoryAdminController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryCron } from './inventory.cron';
import { InventoryListener } from './inventory.listener';
import { InventoryMetricsProvider, InventoryValuationMetricsProvider } from './inventory.metrics';

import { StockCountController } from './stock-count.controller';
import { StockCountService } from './stock-count.service';
import { StockVarianceController } from './stock-variance.controller';
import { StockVarianceService } from './stock-variance.service';

@Module({
  controllers: [InventoryAdminController, StockCountController, StockVarianceController],
  providers: [
    InventoryService,
    InventoryCron,
    InventoryListener,
    StockCountService,
    StockVarianceService,
    InventoryMetricsProvider,
    InventoryValuationMetricsProvider,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
