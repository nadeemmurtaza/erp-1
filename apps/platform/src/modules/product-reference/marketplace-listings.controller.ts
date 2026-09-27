import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MarketplaceCredentialGuard } from './marketplace-credential.guard';
import { MarketplaceKeyThrottlerGuard } from './marketplace-key-throttler.guard';
import { CurrentPublisherTenant } from './decorators';
import { MarketplaceListingsService } from './marketplace-listings.service';
import { CreateMarketplaceListingDto, UpdateMarketplaceListingDto } from './dto/marketplace-listing.dto';
import type { PlatformTenant } from '../../core/prisma/client';

/**
 * Doc 165 §2's own publish API (WO-165.2) — `X-Marketplace-Api-Key`
 * (`MarketplaceCredentialGuard`), the identical tenant-trust boundary
 * `ProductReferenceController` already established for doc 166. No route
 * here accepts a `:tenantId` parameter — "which tenant" is entirely the
 * presented key, the same discipline that controller's own header comment
 * states.
 */
@Controller('marketplace/v1/listings')
@UseGuards(MarketplaceKeyThrottlerGuard, MarketplaceCredentialGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class MarketplaceListingsController {
  constructor(private readonly listings: MarketplaceListingsService) {}

  @Get()
  async mine(@CurrentPublisherTenant() tenant: PlatformTenant) {
    return this.listings.listMine(tenant.id);
  }

  @Post()
  async publish(@CurrentPublisherTenant() tenant: PlatformTenant, @Body() dto: CreateMarketplaceListingDto) {
    return this.listings.publish(tenant.id, dto);
  }

  @Patch(':id')
  async update(
    @CurrentPublisherTenant() tenant: PlatformTenant,
    @Param('id') id: string,
    @Body() dto: UpdateMarketplaceListingDto,
  ) {
    return this.listings.update(tenant.id, id, dto);
  }

  @Post(':id/pause')
  async pause(@CurrentPublisherTenant() tenant: PlatformTenant, @Param('id') id: string) {
    return this.listings.pause(tenant.id, id);
  }

  @Post(':id/resume')
  async resume(@CurrentPublisherTenant() tenant: PlatformTenant, @Param('id') id: string) {
    return this.listings.resume(tenant.id, id);
  }

  @Post(':id/delist')
  async delist(@CurrentPublisherTenant() tenant: PlatformTenant, @Param('id') id: string) {
    return this.listings.delist(tenant.id, id);
  }
}
