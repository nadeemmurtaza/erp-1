import { Module } from '@nestjs/common';
import { PurchasingController, PurchaseOrderAdminController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';

import { InventoryModule } from '../inventory/inventory.module';
import { SettingsModule } from '../../core/settings/settings.module';

@Module({
  imports: [InventoryModule, SettingsModule],
  controllers: [PurchasingController, PurchaseOrderAdminController],
  providers: [PurchasingService],
  exports: [PurchasingService],
})
export class PurchasingModule {}
