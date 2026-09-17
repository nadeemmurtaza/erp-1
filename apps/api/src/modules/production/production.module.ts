import { Module } from '@nestjs/common';
import { BomController, WorkOrdersController } from './production.controller';
import { BomService } from './bom.service';
import { WorkOrdersService } from './work-orders.service';
import { ReorderWorkOrderListener } from './reorder-work-order.listener';
import { StitchingCascadeListener } from './stitching-cascade.listener';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [BomController, WorkOrdersController],
  providers: [BomService, WorkOrdersService, ReorderWorkOrderListener, StitchingCascadeListener],
  exports: [BomService, WorkOrdersService],
})
export class ProductionModule {}
