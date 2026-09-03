import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { OrderNotificationSubscriber } from './notification.subscriber';
import { OrdersAdminController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

import { InventoryModule } from '../inventory/inventory.module';
import { TaxModule } from '../tax/tax.module';

@Module({
  // Payments is the one module orders depends on directly: the payment record
  // must be written in the same transaction as the order. Tax is imported the
  // same way InventoryModule is (WO-1.2) -- a hard NestJS import, not gated by
  // the MODULES allowlist, so checkout can always resolve TaxService even on
  // a deployment where `tax` is excluded from MODULES (its admin routes just
  // won't exist there; tax.enabled stays false with no UI to turn it on).
  imports: [PaymentsModule, InventoryModule, TaxModule],
  controllers: [OrdersController, OrdersAdminController],
  // The subscriber listens to the same events this module publishes. It is a
  // separate provider rather than a method on OrdersService so that what the
  // customer is told stays separable from how an order is placed.
  providers: [OrdersService, OrderNotificationSubscriber],
  exports: [OrdersService],
})
export class OrdersModule {}
