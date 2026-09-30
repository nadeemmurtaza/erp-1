import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { ProductReferencesController } from './product-references.controller';
import { ProductReferenceSyncService } from './product-reference-sync.service';
import { MarketplaceWebhookController } from './marketplace-webhook.controller';
import { MarketplaceWebhookGuard } from './marketplace-webhook.guard';

/**
 * WO-165.2 (165-cross-tenant-marketplace-directory.md) and WO-166.3/166.4
 * (166-unified-product-reference-registry.md). Off by default in MODULES
 * (modules.registry.ts) — a deployment turns it on once ops has issued it a
 * `MarketplacePublisherCredential` (`MARKETPLACE_API_URL`/
 * `MARKETPLACE_API_KEY`), the same "absent collaborator" shape as
 * `managed-services`: with neither set, no nav entry lights up, the
 * autofill lookup always 404s gracefully, and the webhook guard refuses
 * every delivery.
 */
@Module({
  controllers: [MarketplaceController, ProductReferencesController, MarketplaceWebhookController],
  providers: [MarketplaceService, ProductReferenceSyncService, MarketplaceWebhookGuard],
})
export class MarketplaceModule {}
