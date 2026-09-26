import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';

/**
 * WO-165.2 (165-cross-tenant-marketplace-directory.md). Off by default in
 * MODULES (modules.registry.ts) — a deployment turns it on once ops has
 * issued it a `MarketplacePublisherCredential`
 * (`MARKETPLACE_API_URL`/`MARKETPLACE_API_KEY`), the same "absent
 * collaborator" shape as `managed-services`: with neither set, no nav entry
 * lights up and nothing else in this deployment is affected.
 */
@Module({
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
})
export class MarketplaceModule {}
