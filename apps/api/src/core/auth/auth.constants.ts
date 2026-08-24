import type { UserRole } from '../prisma/client';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const PERMISSIONS_KEY = 'auth:permissions';

/** What a verified access token carries. */
export interface JwtPayload {
  sub: string;
  role: UserRole;
  email: string | null;
  phone: string | null;
  /** Issued-at and expiry, added by @nestjs/jwt. */
  iat?: number;
  exp?: number;
}

/** The authenticated principal attached to the request. */
export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  /** Resolved fresh from RolePermission on every request — @see PermissionsResolverService. */
  permissions: string[];
  email: string | null;
  phone: string | null;
}

export const REFRESH_COOKIE = 'yaseen_refresh';
export const CART_COOKIE = 'yaseen_cart';
