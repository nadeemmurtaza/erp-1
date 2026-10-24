import { Module } from '@nestjs/common';
import { AuctionBidController } from './auction-bid.controller';
import { AuctionBidderController } from './auction-bidder.controller';
import { AuctionBidderService } from './auction-bidder.service';
import { AuctionLifecycleCron } from './auction-lifecycle.cron';
import { AuctionLifecycleService } from './auction-lifecycle.service';
import { AuctionLotImageService } from './auction-lot-image.service';
import { AuctionPublicController } from './auction-public.controller';
import { AuctionPublicService } from './auction-public.service';
import { AuctionRealtimeService } from './auction-realtime.service';
import { AuctionSettlementController } from './auction-settlement.controller';
import { AuctionSettlementCron } from './auction-settlement.cron';
import { AuctionSettlementService } from './auction-settlement.service';
import { AuctionSettlementSubscriber } from './auction-settlement.subscriber';
import { AuctionController } from './auction.controller';
import { AuctionService } from './auction.service';

/**
 * The Auction app (launchpad-apps/234-auction-app.md). Off by default
 * (modules.registry.ts): a shop that never sells by bidding must not see the
 * concept at all. Imports no other module — `SettingsModule`, `AuditModule`
 * and the config are global — and the later work orders reach orders, stock
 * and payments through the `AuctionOrderSink` and `AuctionLotSource`
 * extension points and domain events, never an import. Who is verified is read
 * through the core `IdentityVerificationStatusRegistry`, the same way.
 */
@Module({
  controllers: [AuctionController, AuctionBidderController, AuctionBidController, AuctionPublicController, AuctionSettlementController],
  providers: [
    AuctionService,
    AuctionBidderService,
    AuctionLifecycleService,
    AuctionLifecycleCron,
    AuctionLotImageService,
    AuctionPublicService,
    AuctionRealtimeService,
    AuctionSettlementService,
    AuctionSettlementSubscriber,
    AuctionSettlementCron,
  ],
  exports: [AuctionService],
})
export class AuctionModule {}
