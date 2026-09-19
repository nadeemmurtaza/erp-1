export const IS_PUBLIC_KEY = 'auth:isPublic';
export const PERMISSIONS_KEY = 'auth:permissions';

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

/** The authenticated principal attached to the request. */
export interface AuthenticatedUser {
  id: string;
  /** Every `Role` name this user currently holds — plural (custom roles); resolved fresh on every request. */
  roles: string[];
  /** Resolved fresh from every held role's grants, plus overrides, on every request — @see PermissionsResolverService. */
  permissions: string[];
  email: string | null;
  phone: string | null;
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
