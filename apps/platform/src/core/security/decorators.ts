import { SetMetadata } from '@nestjs/common';
import type { PlatformPermission } from './ops-permissions';

export const OPS_PERMISSIONS_KEY = 'opsPermissions';

/**
 * Restricts a route to an ops key holding at least one of the given
 * scopes — the platform equivalent of apps/api's `@RequirePermission`.
 */
export const RequireOpsPermission = (...keys: PlatformPermission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(OPS_PERMISSIONS_KEY, keys);
