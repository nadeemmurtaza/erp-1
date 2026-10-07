import { Module } from '@nestjs/common';
import { TradingPartnersController } from './trading-partners.controller';
import { TradingPartnerPortalController } from './trading-partner-portal.controller';
import { InvoicesController } from './invoices.controller';
import { QuotesController } from './quotes.controller';
import { OffersController } from './offers.controller';
import { TradingPartnersService } from './trading-partners.service';
import { PartnerFactInboxService } from './partner-fact-inbox.service';
import { PartnerFactStatusListener } from './partner-fact-status.listener';
import { InvoiceService } from './invoice.service';
import { QuoteService } from './quote.service';
import { OfferService } from './offer.service';
import { SupplierDigestListener } from './supplier-digest.listener';
import { ProductAlertsListener } from './product-alerts.listener';

/**
 * The trading-partner network (18-trading-partner-network.md). Off by
 * default — see modules.registry.ts — and imports no other module:
 * `Supplier.tradingPartnerId` is a bare scalar (purchasing.prisma), so
 * linking a supplier never requires this module to be enabled, and nothing
 * here imports PurchasingService, CatalogModule or AnalyticsModule either.
 * `SupplierDigestListener` and `ProductAlertsListener` (WO-18.3, outbound
 * delivery) reach those modules only through the domain events they already
 * publish for their own reasons. `TradingPartnerPortalController` (WO-18.2's
 * inbound API) reads catalogue stock/price directly — the first inbound
 * document type that writes into another module (an order, an invoice)
 * will do so through that module's own public service methods, the same
 * way a browser does, not a new parallel path.
 *
 * `InvoiceService`/`QuoteService`/`OfferService` (a bounded MVP of R18, see
 * invoicing.prisma's own header) are the mirror case: every Invoice, Quote
 * and Offer belongs to a TradingPartner and nothing else, so they call
 * `TradingPartnersService.pushOutbound()` directly rather than through a
 * domain event — there is no cross-module boundary here to decouple.
 */
@Module({
  controllers: [
    TradingPartnersController,
    TradingPartnerPortalController,
    InvoicesController,
    QuotesController,
    OffersController,
  ],
  providers: [
    TradingPartnersService,
    PartnerFactInboxService,
    PartnerFactStatusListener,
    InvoiceService,
    QuoteService,
    OfferService,
    SupplierDigestListener,
    ProductAlertsListener,
  ],
  exports: [TradingPartnersService],
})
export class TradingPartnersModule {}
