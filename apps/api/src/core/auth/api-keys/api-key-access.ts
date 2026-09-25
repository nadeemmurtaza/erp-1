import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import {
  CUSTOMER_SCOPES_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  SESSION_ONLY_KEY,
  type ApiKeyPrincipal,
} from '../auth.constants';

/** What a route declares about who may call it, read off its decorators. */
export interface RouteRequirements {
  isPublic: boolean;
  /** `@SessionOnly()` — no API key, ever. */
  sessionOnly: boolean;
  /** `@RequirePermission(...)` — any one suffices. Empty when the route names none. */
  requiredPermissions: readonly string[];
  /** `@CustomerScope(...)` — any one suffices. Empty when the route names none. */
  requiredCustomerScopes: readonly string[];
}

export type ApiKeyAccessDecision = { allowed: true } | { allowed: false; reason: string };

const ALLOW: ApiKeyAccessDecision = { allowed: true };
const deny = (reason: string): ApiKeyAccessDecision => ({ allowed: false, reason });

/**
 * May this API key call this route? The whole of the key-side authorisation
 * rule, as one pure function — no query, no write — so every branch is a
 * unit test and both guards ask the identical question: `JwtAuthGuard`
 * (should a key personalise a `@Public()` route?) and `PermissionsGuard`
 * (may it call a protected one?).
 *
 * **Fail-closed.** A key reaches a route only when the route names a
 * capability of the key's own surface. Every `@AuthenticatedOnly()` route
 * with no `@CustomerScope` — profile edits, devices, notification
 * preferences, the key-management routes themselves — is unreachable by any
 * key without anyone having to remember to exclude it.
 *
 * `effectivePermissions` is an ADMIN key's effective set (already
 * intersected with its owner's live permissions by ApiKeyAuthService); a
 * STOREFRONT key's is always empty.
 */
export function decideApiKeyAccess(
  key: ApiKeyPrincipal,
  effectivePermissions: readonly string[],
  route: RouteRequirements,
): ApiKeyAccessDecision {
  if (route.sessionOnly) {
    return deny('This action needs a signed-in session. API keys cannot perform it.');
  }

  if (key.surface === 'ADMIN') {
    if (route.requiredPermissions.length === 0) {
      return deny('This route does not accept admin API keys.');
    }
    if (route.requiredPermissions.some((permission) => effectivePermissions.includes(permission))) {
      return ALLOW;
    }
    return deny(
      `This API key cannot use this route: it needs ${route.requiredPermissions.join(' or ')}, ` +
        'and the key does not carry it or its owner no longer holds it.',
    );
  }

  if (route.requiredPermissions.length > 0) {
    return deny('Storefront API keys cannot call admin routes.');
  }
  if (route.requiredCustomerScopes.length === 0) {
    return deny('This route does not accept storefront API keys.');
  }
  if (route.requiredCustomerScopes.some((scope) => key.customerScopes.includes(scope))) {
    return ALLOW;
  }
  return deny(`This API key cannot use this route: it needs ${route.requiredCustomerScopes.join(' or ')}.`);
}

/**
 * Reads a route's requirements the way the global guards already read
 * `@Public()`/`@RequirePermission()` — the handler's metadata first, then its
 * controller's — so a method-level decorator overrides a class-level one
 * exactly as it does for sessions.
 */
export function readRouteRequirements(reflector: Reflector, context: ExecutionContext): RouteRequirements {
  const targets = [context.getHandler(), context.getClass()];
  return {
    isPublic: reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) ?? false,
    sessionOnly: reflector.getAllAndOverride<boolean>(SESSION_ONLY_KEY, targets) ?? false,
    requiredPermissions: reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets) ?? [],
    requiredCustomerScopes: reflector.getAllAndOverride<string[]>(CUSTOMER_SCOPES_KEY, targets) ?? [],
  };
}
