import { Module } from '@nestjs/common';
import { InventoryAdminController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryCron } from './inventory.cron';
import { InventoryListener } from './inventory.listener';

@Module({
  controllers: [InventoryAdminController],
  providers: [InventoryService, InventoryCron, InventoryListener],
  exports: [InventoryService],
})
export class InventoryModule {}
