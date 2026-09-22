import { Module } from '@nestjs/common';
import { PurchasingController, PurchaseOrderAdminController, SupplierBillAdminController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';
import { PurchasingCron } from './purchasing.cron';
import { PurchasingReorderListener } from './reorder.listener';
import { GoodsReceiptReplicationListener } from './goods-receipt-replication.listener';

import { InventoryModule } from '../inventory/inventory.module';
import { PartiesModule } from '../parties/parties.module';
import { SettingsModule } from '../../core/settings/settings.module';

@Module({
  imports: [InventoryModule, PartiesModule, SettingsModule],
  controllers: [PurchasingController, PurchaseOrderAdminController, SupplierBillAdminController],
  providers: [PurchasingService, PurchasingCron, PurchasingReorderListener, GoodsReceiptReplicationListener],
  exports: [PurchasingService],
})
export class PurchasingModule {}
