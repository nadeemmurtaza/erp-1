import { Module } from '@nestjs/common';
import { InventoryAdminController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryCron } from './inventory.cron';
import { InventoryListener } from './inventory.listener';

import { StockCountController } from './stock-count.controller';
import { StockCountService } from './stock-count.service';
import { StockVarianceController } from './stock-variance.controller';
import { StockVarianceService } from './stock-variance.service';
import { SpotCheckController, SpotCheckPolicyController } from './spot-check.controller';
import { SpotCheckService } from './spot-check.service';
import { SuspiciousTrafficController } from './suspicious-traffic.controller';
import { SuspiciousTrafficService } from './suspicious-traffic.service';

@Module({
  controllers: [
    InventoryAdminController,
    StockCountController,
    StockVarianceController,
    SpotCheckController,
    SpotCheckPolicyController,
    SuspiciousTrafficController,
  ],
  providers: [
    InventoryService,
    InventoryCron,
    InventoryListener,
    StockCountService,
    StockVarianceService,
    SpotCheckService,
    SuspiciousTrafficService,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
