import { Module } from '@nestjs/common';
import { InventoryAdminController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryCron } from './inventory.cron';
import { InventoryListener } from './inventory.listener';

import { StockCountController } from './stock-count.controller';
import { StockCountService } from './stock-count.service';

@Module({
  controllers: [InventoryAdminController, StockCountController],
  providers: [InventoryService, InventoryCron, InventoryListener, StockCountService],
  exports: [InventoryService],
})
export class InventoryModule {}
