import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { FulfilmentAdminController } from './fulfilment.controller';
import { FulfilmentCron } from './fulfilment.cron';
import { FulfilmentService } from './fulfilment.service';
import { ManualCourierProvider } from './providers/manual.provider';
import { ReturnNotificationSubscriber } from './return-notification.subscriber';
import { ReturnsAdminController, ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { ShippingAdminController, ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

/**
 * WO-6 (06-shipping-fulfilment-returns.md) — shipping as data, the shipment
 * lifecycle, tracking automation and returns/RMA. InventoryModule is a hard
 * import for the same reason orders.module.ts imports it directly (WO-1.2):
 * returns.service.ts#inspect() restocks or writes off a returned item in the
 * same transaction as the ReturnRequestItem write it belongs to
 * (`fulfilment -> inventory` in KNOWN_MODULE_COUPLINGS).
 */
@Module({
  imports: [InventoryModule],
  controllers: [
    ShippingAdminController,
    ShippingController,
    FulfilmentAdminController,
    ReturnsAdminController,
    ReturnsController,
  ],
  providers: [
    ShippingService,
    FulfilmentService,
    FulfilmentCron,
    ManualCourierProvider,
    ReturnsService,
    ReturnNotificationSubscriber,
  ],
  // ShippingService.quote() is what orders.module.ts imports this module
  // for (`orders -> fulfilment` in KNOWN_MODULE_COUPLINGS) — the same
  // synchronous-pricing reason it already imports TaxModule for.
  exports: [ShippingService],
})
export class FulfilmentModule {}
