import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../../core/config/app-config.service';
import type { PublishMarketplaceListingDto, UpdateMarketplaceListingDto } from './dto/marketplace.dto';

/**
 * WO-165.2 — the erp-1 side of "Publish to marketplace"
 * (165-cross-tenant-marketplace-directory.md §2). A deliberately thin,
 * server-side proxy to the platform app's own `MarketplaceListingsController`
 * (`apps/platform/src/modules/product-reference/marketplace-listings
 * .controller.ts`) — this module never stores a listing itself, the
 * platform's own database is the one copy. Authenticated by
 * `MARKETPLACE_API_KEY`, the credential ops issues once this tenant opts
 * into the network — a header this app's own browser bundle never sees,
 * the identical discipline `ManagedServicesService` already established for
 * `AGENCY_API_KEY`.
 */
@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(private readonly config: AppConfigService) {}

  async listMine(): Promise<unknown> {
    return this.request('GET', '/marketplace/v1/listings');
  }

  async publish(dto: PublishMarketplaceListingDto): Promise<unknown> {
    return this.request('POST', '/marketplace/v1/listings', dto);
  }

  async update(id: string, dto: UpdateMarketplaceListingDto): Promise<unknown> {
    return this.request('PATCH', `/marketplace/v1/listings/${encodeURIComponent(id)}`, dto);
  }

  async pause(id: string): Promise<unknown> {
    return this.request('POST', `/marketplace/v1/listings/${encodeURIComponent(id)}/pause`);
  }

  async resume(id: string): Promise<unknown> {
    return this.request('POST', `/marketplace/v1/listings/${encodeURIComponent(id)}/resume`);
  }

  async delist(id: string): Promise<unknown> {
    return this.request('POST', `/marketplace/v1/listings/${encodeURIComponent(id)}/delist`);
  }

  private async request(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<unknown> {
    const baseUrl = this.config.get('MARKETPLACE_API_URL');
    const apiKey = this.config.get('MARKETPLACE_API_KEY');
    if (!baseUrl || !apiKey) {
      throw new ServiceUnavailableException('The marketplace is not configured for this deployment.');
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'x-marketplace-api-key': apiKey,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      this.logger.error(`Marketplace request to ${path} failed to reach the platform — ${error instanceof Error ? error.message : error}`);
      throw new ServiceUnavailableException('Could not reach the marketplace right now.');
    }

    if (!response.ok) {
      this.logger.error(`Marketplace request to ${path} returned ${response.status}`);
      throw new ServiceUnavailableException('The marketplace returned an error.');
    }

    if (response.status === 204) return undefined;
    return response.json();
  }
}
