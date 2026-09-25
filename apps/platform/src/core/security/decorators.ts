import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PlatformPermission } from './ops-permissions';
import type { RequestWithOpsClient } from './ops-auth.guard';

export const OPS_PERMISSIONS_KEY = 'opsPermissions';

/**
 * Restricts a route to an ops key holding at least one of the given
 * scopes — the platform equivalent of apps/api's `@RequirePermission`.
 */
export const RequireOpsPermission = (...keys: PlatformPermission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(OPS_PERMISSIONS_KEY, keys);

/**
 * The calling `PlatformOpsClient`, as `OpsAuthGuard` resolved it — used
 * wherever "who is making this request" must be a structural identity the
 * caller cannot spoof by filling in a body field (the custom-quote and
 * support-access "toxic pair" self-approval refusals both depend on this).
 */
export const CurrentOpsClient = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithOpsClient>();
  return request.opsClient;
});
