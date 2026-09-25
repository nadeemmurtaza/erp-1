import type { ApiKeySurface } from '@newax/shared';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const PERMISSIONS_KEY = 'auth:permissions';
/** @see SessionOnly — refused to every API key, whatever it carries. */
export const SESSION_ONLY_KEY = 'auth:sessionOnly';
/** @see CustomerScope — which storefront API keys may reach a customer route. */
export const CUSTOMER_SCOPES_KEY = 'auth:customerScopes';

/**
 * What a verified access token carries. No `role`/`roles` here on purpose —
 * JwtStrategy.validate() never reads it, only `sub`, re-resolving roles and
 * permissions fresh from the database on every request (so a role edited
 * mid-session takes effect immediately rather than at the next login). A
 * signed claim that is never checked is a stale-data trap waiting to
 * happen, not a convenience.
 */
export interface JwtPayload {
  sub: string;
  email: string | null;
  phone: string | null;
  /** Issued-at and expiry, added by @nestjs/jwt. */
  iat?: number;
  exp?: number;
}

/**
 * The personal API key a request authenticated with, when it did not come
 * from a session (163-personal-api-keys.md). @see ApiKeyAuthService
 */
export interface ApiKeyPrincipal {
  /** The `ApiKey` row. */
  id: string;
  surface: ApiKeySurface;
  /**
   * A STOREFRONT key's scopes, expanded (write ⇒ read) and filtered to the
   * catalogue. Empty for an ADMIN key, whose effective set is
   * `AuthenticatedUser.permissions` itself.
   */
  customerScopes: readonly string[];
}

/** The authenticated principal attached to the request. */
export interface AuthenticatedUser {
  id: string;
  /** Every `Role` name this user currently holds — plural (custom roles); resolved fresh on every request. `[]` for an API key. */
  roles: string[];
  /**
   * Resolved fresh from every held role's grants, plus overrides, on every
   * request — @see PermissionsResolverService. For an API key it is already
   * the key's effective set, `(key's permissions) ∩ (owner's live
   * permissions) − NON_DELEGATABLE_PERMISSIONS`, and `[]` for a STOREFRONT
   * key — so every existing check that reads it (a route's
   * `@RequirePermission`, `stripOrderCost()`'s cost columns) caps a key
   * without knowing keys exist.
   */
  permissions: string[];
  email: string | null;
  phone: string | null;
  /**
   * Present only when the request authenticated with a personal API key.
   * `id` above is still the owner's: a key acts as its owner, never as a
   * separate actor, so every audit row and every "is this your own row"
   * filter treats it as them.
   */
  apiKey?: ApiKeyPrincipal;
}

/*
 * Namespaced to the builder rather than the client.
 *
 * A cookie carrying the client's name has to be renamed at rebrand, and
 * renaming a session cookie signs every logged-in customer out and empties
 * every guest cart. `newax` never changes between deployments, so it never
 * forces that.
 *
 * The old names are still read, so nobody is signed out by this change
 * either — the browser keeps presenting the old cookie until it expires and
 * we keep accepting it, while every new response writes the new one. They
 * can be deleted once the longest max-age below has passed.
 */
/** Marks a route as deliberately open to any signed-in user. @see AuthenticatedOnly */
export const AUTHENTICATED_ONLY_KEY = 'auth:authenticatedOnly';

export const REFRESH_COOKIE = 'newax_refresh';
export const CART_COOKIE = 'newax_cart';

export const LEGACY_REFRESH_COOKIE = 'yaseen_refresh';
export const LEGACY_CART_COOKIE = 'yaseen_cart';

/** The current cookie, or the one written before the rename. */
export function readCookie(
  cookies: Record<string, string | undefined> | undefined,
  name: string,
  legacyName: string,
): string | undefined {
  return cookies?.[name] ?? cookies?.[legacyName];
}
