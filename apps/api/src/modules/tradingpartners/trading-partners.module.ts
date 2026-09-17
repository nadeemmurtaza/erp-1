import { Module } from '@nestjs/common';
import { TradingPartnersController } from './trading-partners.controller';
import { TradingPartnersService } from './trading-partners.service';

/**
 * The trading-partner network (18-trading-partner-network.md). Off by
 * default — see modules.registry.ts — and imports no other module:
 * `Supplier.tradingPartnerId` is a bare scalar (purchasing.prisma), so
 * linking a supplier never requires this module to be enabled, and nothing
 * here imports PurchasingService either. WO-18.2's inbound receiving API
 * will be the first thing that actually calls into `purchasing`, and it
 * will do so the same way a browser does — through PurchasingService's
 * public methods, not a new parallel path.
 */
@Module({
  controllers: [TradingPartnersController],
  providers: [TradingPartnersService],
  exports: [TradingPartnersService],
})
export class TradingPartnersModule {}
