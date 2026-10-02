import { Module } from '@nestjs/common';
import { AuctionController } from './auction.controller';
import { AuctionService } from './auction.service';

/**
 * The Auction app (launchpad-apps/234-auction-app.md). Off by default
 * (modules.registry.ts): a shop that never sells by bidding must not see the
 * concept at all. Imports no other module — `SettingsModule`, `AuditModule`
 * and the config are global — and the later work orders reach orders, stock
 * and payments through the `AuctionOrderSink` and `AuctionLotSource`
 * extension points and domain events, never an import.
 */
@Module({
  controllers: [AuctionController],
  providers: [AuctionService],
  exports: [AuctionService],
})
export class AuctionModule {}
