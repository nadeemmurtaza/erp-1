import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PermissionKey } from '@newax/shared';
import {
  AUTHENTICATED_ONLY_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  type AuthenticatedUser,
} from './auth.constants';

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

/**
 * Marks a route as deliberately open to any signed-in user.
 *
 * It changes nothing at runtime — JwtAuthGuard already requires a token, and
 * these routes scope their own reads by `user.id`. It exists so the decision
 * is *stated*. Without it, "any signed-in user may call this" and "somebody
 * forgot the permission" look identical in the source, and
 * scripts/check-route-permissions.mjs cannot tell them apart either.
 *
 * Use it only where the handler scopes to the caller's own rows. Anything
 * that reads another user's data, or any shop-wide record, needs a real
 * capability instead.
 */
export const AuthenticatedOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATED_ONLY_KEY, true);

/** Injects the authenticated user, or undefined on a @Public route. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
