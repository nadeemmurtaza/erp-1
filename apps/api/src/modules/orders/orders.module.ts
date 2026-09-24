import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { OrderNotificationSubscriber } from './notification.subscriber';
import { OrdersAdminController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { BackorderListener } from './backorder.listener';
import { OrderReplicationListener } from './order-replication.listener';

import { InventoryModule } from '../inventory/inventory.module';
import { TaxModule } from '../tax/tax.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { GiftCardsModule } from '../giftcards/giftcards.module';

@Module({
  // Payments is the one module orders depends on directly: the payment record
  // must be written in the same transaction as the order. Tax is imported the
  // same way InventoryModule is (WO-1.2) -- a hard NestJS import, not gated by
  // the MODULES allowlist, so checkout can always resolve TaxService even on
  // a deployment where `tax` is excluded from MODULES (its admin routes just
  // won't exist there; tax.enabled stays false with no UI to turn it on).
  // Promotions/giftcards join the same list for the same reason (WO-5,
  // `orders -> promotions`/`orders -> giftcards` in KNOWN_MODULE_COUPLINGS):
  // usage-count/balance conditional updates must land in the same
  // transaction as the order they belong to.
  imports: [PaymentsModule, InventoryModule, TaxModule, PromotionsModule, GiftCardsModule],
  controllers: [OrdersController, OrdersAdminController],
  // The subscriber listens to the same events this module publishes. It is a
  // separate provider rather than a method on OrdersService so that what the
  // customer is told stays separable from how an order is placed.
  providers: [OrdersService, OrderNotificationSubscriber, BackorderListener, OrderReplicationListener],
  exports: [OrdersService],
})
export class OrdersModule {}
