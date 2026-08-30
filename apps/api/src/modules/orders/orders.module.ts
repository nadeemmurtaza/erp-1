import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { OrderNotificationSubscriber } from './notification.subscriber';
import { OrdersAdminController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

import { InventoryModule } from '../inventory/inventory.module';

@Module({
  // Payments is the one module orders depends on directly: the payment record
  // must be written in the same transaction as the order.
  imports: [PaymentsModule, InventoryModule],
  controllers: [OrdersController, OrdersAdminController],
  // The subscriber listens to the same events this module publishes. It is a
  // separate provider rather than a method on OrdersService so that what the
  // customer is told stays separable from how an order is placed.
  providers: [OrdersService, OrderNotificationSubscriber],
  exports: [OrdersService],
})
export class OrdersModule {}
