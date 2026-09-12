import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PermissionKey } from '@newax/shared';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, type AuthenticatedUser } from './auth.constants';

/**
 * Marks a route as reachable without a token.
 *
 * JwtAuthGuard is registered globally, so authentication is the default and
 * forgetting a guard leaves a route protected rather than open.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Restricts a route to callers holding at least one of the given
 * permissions. Implies authentication. Which roles currently hold a
 * permission is data (RolePermission), edited from /admin/settings — this
 * decorator only ever names the capability, never a role.
 */
export const RequirePermission = (...keys: PermissionKey[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, keys);

/** Injects the authenticated user, or undefined on a @Public route. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
