import { Module } from '@nestjs/common';
import { InventoryAdminController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryAdminController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
