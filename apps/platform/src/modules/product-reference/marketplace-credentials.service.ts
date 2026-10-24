import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { generateMarketplaceApiKey, hashMarketplaceApiKey } from './product-reference-key';
import { MarketplaceListingsService } from './marketplace-listings.service';
import type { MarketplacePublisherCredential } from '../../core/prisma/client';

/**
 * The ops-facing half of docs 165/166, mirroring `AgencyClientsService`'s
 * own shape exactly: an ops principal (`OpsAuthGuard`,
 * `platform.marketplace.manage`) mints a `MarketplacePublisherCredential`
 * on an EXISTING `PlatformTenant` — never creates a new entity, the same
 * ADR-039 convention `AgencyClientsService.register()` already established.
 * "Registering for the marketplace network" is issuing this row's
 * `apiKeyHash` for the first time; rotation replaces it, invalidating the
 * old key in the same write.
 */
@Injectable()
export class MarketplaceCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly listings: MarketplaceListingsService,
  ) {}

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`No tenant with id ${tenantId}`);
  }

  /**
   * Mints a fresh key, stores only its hash, and returns the plaintext
   * exactly once — there is no endpoint that recovers a lost key, only
   * `rotate()`. Refuses a tenant already registered, so a double `issue()`
   * call can never silently orphan the key a tenant's own admin already
   * holds.
   */
  async issue(tenantId: string): Promise<{ credential: MarketplacePublisherCredential; apiKey: string }> {
    await this.assertTenantExists(tenantId);

    const existing = await this.prisma.marketplacePublisherCredential.findUnique({ where: { tenantId } });
    if (existing) {
      throw new BadRequestException(`Tenant ${tenantId} already has a marketplace credential — use rotate instead.`);
    }

    const apiKey = generateMarketplaceApiKey();
    const apiKeyHash = hashMarketplaceApiKey(apiKey, this.config.get('PLATFORM_MARKETPLACE_KEY_PEPPER'));

    const credential = await this.prisma.marketplacePublisherCredential.create({
      data: { tenantId, apiKeyHash },
    });

    return { credential, apiKey };
  }

  async rotate(tenantId: string): Promise<{ credential: MarketplacePublisherCredential; apiKey: string }> {
    const existing = await this.prisma.marketplacePublisherCredential.findUnique({ where: { tenantId } });
    if (!existing) throw new NotFoundException(`Tenant ${tenantId} has no marketplace credential to rotate`);

    const apiKey = generateMarketplaceApiKey();
    const apiKeyHash = hashMarketplaceApiKey(apiKey, this.config.get('PLATFORM_MARKETPLACE_KEY_PEPPER'));

    const credential = await this.prisma.marketplacePublisherCredential.update({
      where: { tenantId },
      data: { apiKeyHash, rotatedAt: new Date() },
    });

    return { credential, apiKey };
  }

  /**
   * Revoking a tenant's participation entirely — doc 165/166's own "the
   * grant that ends itself" lens. Deleting the credential row, not a status
   * flag: there is nothing else on this row to preserve once a tenant is no
   * longer authenticating with it, and `GlobalProductReferenceLink` rows
   * this tenant already created are untouched (their own local cache does
   * not depend on the credential staying live). Doc 165's own listings are
   * different: they are LIVE published data, so revocation also delists
   * every one this tenant owns immediately — no dangling published data
   * outliving the credential that published it.
   */
  async revoke(tenantId: string): Promise<void> {
    const existing = await this.prisma.marketplacePublisherCredential.findUnique({ where: { tenantId } });
    if (!existing) throw new NotFoundException(`Tenant ${tenantId} has no marketplace credential to revoke`);
    await this.prisma.marketplacePublisherCredential.delete({ where: { tenantId } });
    await this.listings.delistAllForTenant(tenantId);
  }
}
