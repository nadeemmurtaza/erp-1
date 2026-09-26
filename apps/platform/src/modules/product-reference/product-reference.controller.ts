import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MarketplaceCredentialGuard } from './marketplace-credential.guard';
import { MarketplaceKeyThrottlerGuard } from './marketplace-key-throttler.guard';
import { CurrentPublisherTenant } from './decorators';
import { ProductReferenceService } from './product-reference.service';
import {
  BulkLookupProductReferenceDto,
  FlagProductReferenceDto,
  LinkProductReferenceDto,
  RegisterProductReferenceDto,
  UpdateProductReferenceDto,
} from './dto/product-reference.dto';
import type { PlatformTenant } from '../../core/prisma/client';

/**
 * Doc 166's own tenant-facing API — `X-Marketplace-Api-Key`
 * (`MarketplaceCredentialGuard`), the identical service-to-service shape
 * `AgencyReportingController` already establishes for
 * `X-Agency-Api-Key`. Deliberately no `:tenantId` parameter anywhere on
 * this controller for the tenant-scoped routes (`export`, `register`,
 * `update`, `link`, `flag`) — "which tenant" is entirely the presented
 * key, so a leaked key can only ever act as that one tenant.
 *
 * Route order matters: `export` (a literal path segment) is declared
 * before `:barcode` (a parameterized one) so `GET .../export` is never
 * swallowed by the barcode lookup route — Express/Nest resolves two
 * equally-specific GET patterns in declaration order, not by specificity.
 */
@Controller('marketplace/v1/product-references')
@UseGuards(MarketplaceKeyThrottlerGuard, MarketplaceCredentialGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class ProductReferenceController {
  constructor(private readonly references: ProductReferenceService) {}

  /** The pull path for an offline-capable deployment (doc 166 §2's "Bulk
   *  pull") — must be declared before `:barcode` below. See this class's
   *  own doc comment. */
  @Get('export')
  async export(@CurrentPublisherTenant() tenant: PlatformTenant, @Query('since') since?: string) {
    let sinceDate: Date | undefined;
    if (since) {
      sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) {
        throw new BadRequestException('since must be a valid ISO 8601 timestamp');
      }
    }
    return this.references.exportSince(tenant.id, sinceDate);
  }

  @Post('bulk-lookup')
  async bulkLookup(@Body() dto: BulkLookupProductReferenceDto) {
    return this.references.bulkLookup(dto.barcodes);
  }

  @Post()
  async register(@CurrentPublisherTenant() tenant: PlatformTenant, @Body() dto: RegisterProductReferenceDto) {
    return this.references.register(tenant.id, dto);
  }

  @Get(':barcode')
  async lookup(@Param('barcode') barcode: string) {
    const reference = await this.references.lookup(barcode);
    if (!reference) throw new NotFoundException(`No product reference registered for barcode ${barcode}`);
    return reference;
  }

  @Patch(':id')
  async update(
    @CurrentPublisherTenant() tenant: PlatformTenant,
    @Param('id') id: string,
    @Body() dto: UpdateProductReferenceDto,
  ) {
    return this.references.update(tenant.id, id, dto);
  }

  @Post(':id/link')
  async link(@CurrentPublisherTenant() tenant: PlatformTenant, @Param('id') id: string, @Body() dto: LinkProductReferenceDto) {
    await this.references.link(tenant.id, id, dto.variantRef);
    return { linked: true };
  }

  @Post(':id/flags')
  async flag(@CurrentPublisherTenant() tenant: PlatformTenant, @Param('id') id: string, @Body() dto: FlagProductReferenceDto) {
    await this.references.flag(tenant.id, id, dto.reason);
    return { flagged: true };
  }
}
