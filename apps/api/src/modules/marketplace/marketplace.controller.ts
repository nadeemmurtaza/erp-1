import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '../../core/auth/decorators';
import { MarketplaceService } from './marketplace.service';
import { PublishMarketplaceListingDto, UpdateMarketplaceListingDto } from './dto/marketplace.dto';

/**
 * WO-165.2 — "who may create/rotate a MarketplacePublisherCredential and
 * edit visibleTo/engagementMode on a tenant's own listings is that tenant's
 * own existing admin permission (catalog.manage or equivalent, unchanged)
 * — this document adds no new platform-side permission for tenant-initiated
 * actions" (165-cross-tenant-marketplace-directory.md's own "Authority and
 * blast radius" lens).
 */
@Controller('admin/marketplace/listings')
@RequirePermission('catalog.manage')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get()
  mine() {
    return this.marketplace.listMine();
  }

  @Post()
  publish(@Body() dto: PublishMarketplaceListingDto) {
    return this.marketplace.publish(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMarketplaceListingDto) {
    return this.marketplace.update(id, dto);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.marketplace.pause(id);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string) {
    return this.marketplace.resume(id);
  }

  @Post(':id/delist')
  delist(@Param('id') id: string) {
    return this.marketplace.delist(id);
  }
}
