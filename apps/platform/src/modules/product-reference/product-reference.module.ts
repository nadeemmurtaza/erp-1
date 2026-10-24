import { Module } from '@nestjs/common';
import { MarketplaceCredentialsController } from './marketplace-credentials.controller';
import { MarketplaceCredentialsService } from './marketplace-credentials.service';
import { MarketplaceListingsController } from './marketplace-listings.controller';
import { MarketplaceListingsService } from './marketplace-listings.service';
import { ProductReferenceController } from './product-reference.controller';
import { ProductReferenceService } from './product-reference.service';
import { MarketplaceCredentialGuard } from './marketplace-credential.guard';
import { MarketplaceKeyThrottlerGuard } from './marketplace-key-throttler.guard';

/**
 * Docs 165/166 — the cross-tenant marketplace/product-reference network.
 * Classified `core` in the same sense `AgencyModule` already is: there is
 * no module-pack allowlist in this app, `scripts/check-module-boundaries.mjs`
 * only ever scans `apps/api`. Ships doc 166's own registry
 * (`ProductReferenceController`), the shared tenant credential
 * (`MarketplaceCredentialsController`, ops-gated), and doc 165's own publish
 * layer (`MarketplaceListingsController`, WO-165.2) — discovery/transact
 * (WO-165.3/165.4) are schema only; see `marketplace.prisma`'s own header
 * note for why.
 */
@Module({
  controllers: [MarketplaceCredentialsController, MarketplaceListingsController, ProductReferenceController],
  providers: [
    MarketplaceCredentialsService,
    MarketplaceListingsService,
    ProductReferenceService,
    MarketplaceCredentialGuard,
    MarketplaceKeyThrottlerGuard,
  ],
})
export class ProductReferenceModule {}
