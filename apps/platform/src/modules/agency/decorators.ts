import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { RequestWithAgencyClient } from './agency-api-key.guard';

/** The `PlatformTenant` `AgencyApiKeyGuard` resolved from the presented
 *  `X-Agency-Api-Key` — the ONLY way a route behind that guard learns which
 *  tenant it is serving. No route in `agency-reporting.controller.ts`
 *  accepts a tenant/client id from anywhere else. */
export const CurrentAgencyClient = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithAgencyClient>();
  return request.agencyClient;
});
