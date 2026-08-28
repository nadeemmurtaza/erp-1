import { Module } from '@nestjs/common';
import { PurchasingController, PurchaseOrderAdminController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';
import { CatalogModule } from '../catalog/catalog.module';

import { InventoryModule } from '../inventory/inventory.module';
import { SettingsModule } from '../../core/settings/settings.module';

@Module({
  imports: [CatalogModule, InventoryModule, SettingsModule],
  controllers: [PurchasingController, PurchaseOrderAdminController],
  providers: [PurchasingService],
  exports: [PurchasingService],
})
export class PurchasingModule {}
