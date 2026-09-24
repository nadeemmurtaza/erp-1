import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { OrderNotificationSubscriber } from './notification.subscriber';
import { OrdersAdminController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { BackorderListener } from './backorder.listener';
import { OrderReplicationListener } from './order-replication.listener';
import { ShipmentStatusListener } from './shipment-status.listener';

import { InventoryModule } from '../inventory/inventory.module';
import { TaxModule } from '../tax/tax.module';
import { FulfilmentModule } from '../fulfilment/fulfilment.module';

@Module({
  // Payments is the one module orders depends on directly: the payment record
  // must be written in the same transaction as the order. Tax and Fulfilment
  // are imported the same way InventoryModule is (WO-1.2) -- a hard NestJS
  // import, not gated by the MODULES allowlist, so checkout can always
  // resolve TaxService/ShippingService even on a deployment where `tax` or
  // `fulfilment` is excluded from MODULES (their admin routes just won't
  // exist there).
  imports: [PaymentsModule, InventoryModule, TaxModule, FulfilmentModule],
  controllers: [OrdersController, OrdersAdminController],
  // The subscribers listen to the same events this module publishes (or, for
  // ShipmentStatusListener, events fulfilment publishes) — separate
  // providers rather than methods on OrdersService so that what the customer
  // is told, and how a shipment/return reaches Order.status, stay separable
  // from how an order is placed.
  providers: [
    OrdersService,
    OrderNotificationSubscriber,
    BackorderListener,
    OrderReplicationListener,
    ShipmentStatusListener,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
