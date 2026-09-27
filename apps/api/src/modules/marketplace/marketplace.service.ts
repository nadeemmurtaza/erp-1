import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../../core/config/app-config.service';
import type { PublishMarketplaceListingDto, UpdateMarketplaceListingDto } from './dto/marketplace.dto';

export interface ProductReferenceTranslationView {
  locale: string;
  name: string;
  description: string | null;
  careInstructions: string | null;
}

export interface ProductReferenceImageView {
  id: string;
  url: string;
  altText: string;
  order: number;
}

/** The platform's own `ReferenceWithDetails` shape
 *  (product-reference.service.ts) — never trusted from a client, only ever
 *  read back from a lookup/register call this service itself made. */
export interface ProductReferenceView {
  id: string;
  barcode: string;
  updatedAt: string;
  translations: ProductReferenceTranslationView[];
  images: ProductReferenceImageView[];
}

export interface RegisterProductReferenceInput {
  barcode: string;
  translations: { locale: string; name: string; description?: string | null; careInstructions?: string | null }[];
  images?: { url: string; altText: string; order?: number }[];
  attributes?: Record<string, unknown>;
}

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

  /**
   * `GET /marketplace/v1/product-references/:barcode`
   * (166-unified-product-reference-registry.md WO-166.3) — the autofill
   * lookup. Returns null on a genuine "no match", the REQUEST-refusable
   * case doc 166's own "Request or record" lens describes: the caller
   * falls back to a blank form, never an error banner.
   */
  async lookupProductReference(barcode: string): Promise<ProductReferenceView | null> {
    return this.request('GET', `/marketplace/v1/product-references/${encodeURIComponent(barcode)}`, undefined, {
      notFoundReturnsNull: true,
    }) as Promise<ProductReferenceView | null>;
  }

  /** `POST /marketplace/v1/product-references` — a barcode with no existing
   *  reference. `registeredByTenantId` is set by the platform from the
   *  presented credential, never sent here. */
  async registerProductReference(input: RegisterProductReferenceInput): Promise<ProductReferenceView> {
    return this.request('POST', '/marketplace/v1/product-references', input) as Promise<ProductReferenceView>;
  }

  /** `POST /marketplace/v1/product-references/:id/link` — records that this
   *  tenant now stocks the given reference, so a future push sync (once the
   *  platform's own dispatcher exists) reaches it. Never blocks the local
   *  write it follows — see `ProductReferencesController`'s own callers. */
  async linkProductReference(referenceId: string, variantId: string): Promise<void> {
    await this.request('POST', `/marketplace/v1/product-references/${encodeURIComponent(referenceId)}/link`, {
      variantRef: variantId,
    });
  }

  private async request(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
    options?: { notFoundReturnsNull?: boolean },
  ): Promise<unknown> {
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

    if (response.status === 404 && options?.notFoundReturnsNull) return null;

    if (!response.ok) {
      this.logger.error(`Marketplace request to ${path} returned ${response.status}`);
      throw new ServiceUnavailableException('The marketplace returned an error.');
    }

    if (response.status === 204) return undefined;
    return response.json();
  }
}
