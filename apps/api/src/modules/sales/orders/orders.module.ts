import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { OrderNotificationSubscriber } from './notification.subscriber';
import { OrdersAdminController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { BackorderListener } from './backorder.listener';
import { OrderReplicationListener } from './order-replication.listener';
import { ShipmentStatusListener } from './shipment-status.listener';
import { CodRiskService } from './cod-risk.service';
import { CodRiskCron } from './cod-risk.cron';
import { InstalmentPlanController } from './instalment-plan.controller';
import { InstalmentPlanService } from './instalment-plan.service';
import { OrderFeedSource } from './order-feed.source';
import { AuctionOrderSinkService } from './auction-order-sink';

import { InventoryModule } from '../../supply-chain/inventory/inventory.module';
import { TaxModule } from '../../money/tax/tax.module';
import { FulfilmentModule } from '../fulfilment/fulfilment.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { GiftCardsModule } from '../giftcards/giftcards.module';
import { PricingModule } from '../pricing/pricing.module';
import { CatalogModule } from '../../merchandising/catalog/catalog.module';

@Module({
  // Payments is the one module orders depends on directly: the payment record
  // must be written in the same transaction as the order. Tax, Fulfilment,
  // Promotions and GiftCards are imported the same way InventoryModule is
  // (WO-1.2) -- a hard NestJS import, not gated by the MODULES allowlist, so
  // checkout can always resolve TaxService/ShippingService/PromotionsService/
  // GiftCardsService/StoreCreditService even on a deployment where the
  // matching module is excluded from MODULES (their admin routes just won't
  // exist there; tax.enabled stays false with no UI to turn it on).
  // Promotions/giftcards join the list for a second reason (WO-5,
  // `orders -> promotions`/`orders -> giftcards` in KNOWN_MODULE_COUPLINGS):
  // usage-count/balance conditional updates must land in the same
  // transaction as the order they belong to.
  imports: [PaymentsModule, InventoryModule, TaxModule, FulfilmentModule, PromotionsModule, GiftCardsModule, PricingModule, CatalogModule],
  controllers: [OrdersController, OrdersAdminController, InstalmentPlanController],
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
    CodRiskService,
    CodRiskCron,
    InstalmentPlanService,
    OrderFeedSource,
    // Registers itself as the invoicing sink for the Auction app (doc 234 §9,
    // WO-234.6) through core's AuctionOrderSinkRegistry; nothing here imports it.
    AuctionOrderSinkService,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
