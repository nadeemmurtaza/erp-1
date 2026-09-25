import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { CustomerScopeKey, PermissionKey } from '@newax/shared';
import {
  AUTHENTICATED_ONLY_KEY,
  CUSTOMER_SCOPES_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  SESSION_ONLY_KEY,
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

/**
 * Refuses the route to every personal API key, whatever permission or scope
 * it carries — only a signed-in session may call it.
 *
 * Every route that issues, rotates or installs a credential, or changes an
 * account's sign-in identity, carries this, including where the permission
 * gating it is otherwise fine to delegate (`purchasing.manage` gates minting
 * a trading-partner key): a key must never mint something that outlives it.
 * See 163-personal-api-keys.md §2 and `session-only-routes.spec.ts`.
 */
export const SessionOnly = (): MethodDecorator & ClassDecorator => SetMetadata(SESSION_ONLY_KEY, true);

/**
 * Lets a storefront API key reach this customer self-service route when it
 * carries any one of the named scopes (`CUSTOMER_SCOPE_CATALOG`). Changes
 * nothing for a signed-in session, and nothing about whose rows the handler
 * reads — it still scopes to `user.id`, the key's owner.
 *
 * A customer route without it is unreachable by every storefront key. That
 * is the default on purpose: a new route is closed to keys until someone
 * decides an integration should reach it.
 */
export const CustomerScope = (...scopes: CustomerScopeKey[]): MethodDecorator & ClassDecorator =>
  SetMetadata(CUSTOMER_SCOPES_KEY, scopes);

/** Injects the authenticated user, or undefined on a @Public route. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
