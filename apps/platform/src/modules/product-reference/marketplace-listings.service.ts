import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { MarketplaceListing } from '../../core/prisma/client';
import type { CreateMarketplaceListingDto, UpdateMarketplaceListingDto } from './dto/marketplace-listing.dto';

/**
 * Doc 165 §2's own publish layer, WO-165.2. Every write is scoped to the
 * tenant `MarketplaceCredentialGuard` resolved from the presented key —
 * this service is never given a tenant id it did not itself verify.
 */
@Injectable()
export class MarketplaceListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(tenantId: string): Promise<MarketplaceListing[]> {
    return this.prisma.marketplaceListing.findMany({
      where: { tenantId },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /**
   * `POST /marketplace/v1/listings` — upserts on `[tenantId, externalRef]`,
   * so re-publishing the same product/service updates the existing listing
   * rather than creating a duplicate ("the second copy of the write" lens,
   * doc 165's own unique constraint is what makes this safe). A listing
   * previously PAUSED or DELISTED comes back ACTIVE on republish — the
   * tenant re-publishing is itself the signal they want it live again.
   */
  async publish(tenantId: string, dto: CreateMarketplaceListingDto): Promise<MarketplaceListing> {
    return this.prisma.marketplaceListing.upsert({
      where: { tenantId_externalRef: { tenantId, externalRef: dto.externalRef } },
      create: {
        tenantId,
        kind: dto.kind,
        externalRef: dto.externalRef,
        title: dto.title,
        description: dto.description,
        priceMinorUnits: dto.priceMinorUnits ?? null,
        currency: dto.currency ?? null,
        imageUrl: dto.imageUrl ?? null,
        visibleTo: dto.visibleTo,
        engagementMode: dto.engagementMode ?? 'DISCOVERY_ONLY',
      },
      update: {
        title: dto.title,
        description: dto.description,
        priceMinorUnits: dto.priceMinorUnits ?? null,
        currency: dto.currency ?? null,
        imageUrl: dto.imageUrl ?? null,
        visibleTo: dto.visibleTo,
        engagementMode: dto.engagementMode ?? 'DISCOVERY_ONLY',
        status: 'ACTIVE',
      },
    });
  }

  private async getOwnedOrThrow(tenantId: string, id: string): Promise<MarketplaceListing> {
    const listing = await this.prisma.marketplaceListing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException(`No listing with id ${id}`);
    if (listing.tenantId !== tenantId) {
      throw new ForbiddenException('Only the publishing tenant may change this listing.');
    }
    return listing;
  }

  async update(tenantId: string, id: string, dto: UpdateMarketplaceListingDto): Promise<MarketplaceListing> {
    await this.getOwnedOrThrow(tenantId, id);
    return this.prisma.marketplaceListing.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priceMinorUnits: dto.priceMinorUnits,
        currency: dto.currency,
        imageUrl: dto.imageUrl,
        visibleTo: dto.visibleTo,
        engagementMode: dto.engagementMode,
      },
    });
  }

  async pause(tenantId: string, id: string): Promise<MarketplaceListing> {
    await this.getOwnedOrThrow(tenantId, id);
    return this.prisma.marketplaceListing.update({ where: { id }, data: { status: 'PAUSED' } });
  }

  async resume(tenantId: string, id: string): Promise<MarketplaceListing> {
    await this.getOwnedOrThrow(tenantId, id);
    return this.prisma.marketplaceListing.update({ where: { id }, data: { status: 'ACTIVE' } });
  }

  async delist(tenantId: string, id: string): Promise<MarketplaceListing> {
    await this.getOwnedOrThrow(tenantId, id);
    return this.prisma.marketplaceListing.update({ where: { id }, data: { status: 'DELISTED' } });
  }

  /**
   * "The grant that ends itself" — called by
   * `MarketplaceCredentialsService.revoke()` in the same transaction-free
   * sequence: no dangling published data may outlive the credential that
   * published it. `updateMany` rather than a loop of `delist()` calls, so
   * this is one statement regardless of how many listings a tenant has.
   */
  async delistAllForTenant(tenantId: string): Promise<number> {
    const result = await this.prisma.marketplaceListing.updateMany({
      where: { tenantId, status: { not: 'DELISTED' } },
      data: { status: 'DELISTED' },
    });
    return result.count;
  }
}
