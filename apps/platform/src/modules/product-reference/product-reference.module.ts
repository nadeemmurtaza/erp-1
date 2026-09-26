import { Module } from '@nestjs/common';
import { MarketplaceCredentialsController } from './marketplace-credentials.controller';
import { MarketplaceCredentialsService } from './marketplace-credentials.service';
import { ProductReferenceController } from './product-reference.controller';
import { ProductReferenceService } from './product-reference.service';
import { MarketplaceCredentialGuard } from './marketplace-credential.guard';
import { MarketplaceKeyThrottlerGuard } from './marketplace-key-throttler.guard';

/**
 * Docs 165/166 — the cross-tenant marketplace/product-reference network.
 * Classified `core` in the same sense `AgencyModule` already is: there is
 * no module-pack allowlist in this app, `scripts/check-module-boundaries.mjs`
 * only ever scans `apps/api`. Currently ships only doc 166's own registry
 * (`ProductReferenceController`) plus the shared tenant credential
 * (`MarketplaceCredentialsController`, ops-gated) doc 165 first named — doc
 * 165's own `MarketplaceListing`/discovery/transact layer is not yet built
 * and will extend this same module rather than a second one, per
 * `marketplace.prisma`'s own header note.
 */
@Module({
  controllers: [MarketplaceCredentialsController, ProductReferenceController],
  providers: [MarketplaceCredentialsService, ProductReferenceService, MarketplaceCredentialGuard, MarketplaceKeyThrottlerGuard],
})
export class ProductReferenceModule {}
