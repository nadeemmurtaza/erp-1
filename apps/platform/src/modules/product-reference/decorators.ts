import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { RequestWithPublisherTenant } from './marketplace-credential.guard';

/** The `PlatformTenant` `MarketplaceCredentialGuard` resolved from the
 *  presented `X-Marketplace-Api-Key` — the ONLY way a route behind that
 *  guard learns which tenant it is serving. No route in
 *  `product-reference.controller.ts` accepts a tenant id from anywhere
 *  else. */
export const CurrentPublisherTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithPublisherTenant>();
  return request.publisherTenant;
});
