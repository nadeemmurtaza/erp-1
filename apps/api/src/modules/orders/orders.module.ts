import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersAdminController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

import { InventoryModule } from '../inventory/inventory.module';

@Module({
  // Payments is the one module orders depends on directly: the payment record
  // must be written in the same transaction as the order.
  imports: [PaymentsModule, InventoryModule],
  controllers: [OrdersController, OrdersAdminController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
