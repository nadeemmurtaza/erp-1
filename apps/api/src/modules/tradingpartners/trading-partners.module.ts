import { Module } from '@nestjs/common';
import { TradingPartnersController } from './trading-partners.controller';
import { TradingPartnerPortalController } from './trading-partner-portal.controller';
import { TradingPartnersService } from './trading-partners.service';

/**
 * The trading-partner network (18-trading-partner-network.md). Off by
 * default — see modules.registry.ts — and imports no other module:
 * `Supplier.tradingPartnerId` is a bare scalar (purchasing.prisma), so
 * linking a supplier never requires this module to be enabled, and nothing
 * here imports PurchasingService either. `TradingPartnerPortalController`
 * (WO-18.2's inbound API) reads catalogue stock/price directly — the first
 * inbound document type that writes into another module (an order, an
 * invoice) will do so through that module's own public service methods,
 * the same way a browser does, not a new parallel path.
 */
@Module({
  controllers: [TradingPartnersController, TradingPartnerPortalController],
  providers: [TradingPartnersService],
  exports: [TradingPartnersService],
})
export class TradingPartnersModule {}
