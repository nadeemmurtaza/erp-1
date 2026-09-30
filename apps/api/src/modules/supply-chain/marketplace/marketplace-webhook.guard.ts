import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '../../../core/config/app-config.service';

/**
 * Authenticates an inbound push FROM the platform (166-unified-product-
 * reference-registry.md WO-166.4), the reverse direction of
 * `MarketplaceService`'s own outbound calls. Deliberately reuses the same
 * `MARKETPLACE_API_KEY` this tenant already holds rather than a second
 * credential — doc 165's own "one credential per tenant authenticates both
 * capabilities, never a second key to manage" restated for the inbound
 * direction. A tenant with no key configured refuses every delivery, the
 * same "absent collaborator" shape as every other marketplace route.
 */
@Injectable()
export class MarketplaceWebhookGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-marketplace-api-key'];
    const presented = Array.isArray(header) ? header[0] : header;
    const configured = this.config.get('MARKETPLACE_API_KEY');

    if (!configured || !presented || !constantTimeEquals(presented, configured)) {
      throw new UnauthorizedException('Missing or invalid X-Marketplace-Api-Key header.');
    }

    return true;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}
