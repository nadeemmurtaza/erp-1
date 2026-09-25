import { Module } from '@nestjs/common';
import { PurchasingController, PurchaseOrderAdminController, SupplierBillAdminController } from './purchasing.controller';
import { RequisitionController } from './requisition.controller';
import { PurchasingService } from './purchasing.service';
import { RequisitionService } from './requisition.service';
import { PurchasingCron } from './purchasing.cron';
import { PurchasingReorderListener } from './reorder.listener';
import { GoodsReceiptReplicationListener } from './goods-receipt-replication.listener';

import { InventoryModule } from '../inventory/inventory.module';
import { PartiesModule } from '../parties/parties.module';
import { SettingsModule } from '../../core/settings/settings.module';

@Module({
  imports: [InventoryModule, PartiesModule, SettingsModule],
  controllers: [PurchasingController, PurchaseOrderAdminController, SupplierBillAdminController, RequisitionController],
  providers: [PurchasingService, RequisitionService, PurchasingCron, PurchasingReorderListener, GoodsReceiptReplicationListener],
  exports: [PurchasingService, RequisitionService],
})
export class PurchasingModule {}
