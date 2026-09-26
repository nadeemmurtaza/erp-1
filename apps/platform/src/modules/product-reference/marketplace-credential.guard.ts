import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { hashMarketplaceApiKey } from './product-reference-key';
import type { PlatformTenant } from '../../core/prisma/client';

export interface RequestWithPublisherTenant extends Request {
  publisherTenant?: PlatformTenant;
}

/**
 * Docs 165/166's own tenant-trust boundary for the cross-tenant network,
 * mirroring `AgencyApiKeyGuard`'s exact shape and its load-bearing
 * property: there is no endpoint that takes a tenant id as a parameter —
 * "which tenant" is entirely determined by which key was presented, so a
 * leaked key can only ever act as that one tenant. Every route this guards
 * reads `req.publisherTenant` for its tenant id; none of them accept one
 * from the client, the query string, or the body.
 *
 * A fourth kind of "actor with three tables" principal in this codebase's
 * own terms — a key-hash credential carried on its own row
 * (`MarketplacePublisherCredential`), not on `PlatformTenant` itself the
 * way the agency key is, since a tenant's participation in this network is
 * a separate, revocable fact from its billing/hosting status.
 */
@Injectable()
export class MarketplaceCredentialGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPublisherTenant>();
    const header = request.headers['x-marketplace-api-key'];
    const rawKey = Array.isArray(header) ? header[0] : header;

    if (!rawKey) {
      throw new UnauthorizedException('Missing X-Marketplace-Api-Key header.');
    }

    const apiKeyHash = hashMarketplaceApiKey(rawKey, this.config.get('PLATFORM_MARKETPLACE_KEY_PEPPER'));
    const credential = await this.prisma.marketplacePublisherCredential.findUnique({
      where: { apiKeyHash },
      include: { tenant: true },
    });

    if (!credential) {
      throw new UnauthorizedException('Marketplace API key is invalid or has been rotated.');
    }

    request.publisherTenant = credential.tenant;
    return true;
  }
}
