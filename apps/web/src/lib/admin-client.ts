'use client';

import { singleFlight } from '@newax/shared';
import { ApiError, API_URL } from './api';
import { request, requestWithRefresh } from './api-client';
import type { AuthResult, AuthUser, SsoSignInOption } from '@/types/api';
import { STORAGE_KEYS } from '@/constants/storage';

const ACCESS_KEY = STORAGE_KEYS.admin.access;
const REFRESH_KEY = STORAGE_KEYS.admin.refresh;
const USER_KEY = STORAGE_KEYS.admin.user;

/**
 * Browser-side API client for the back office.
 *
 * The admin is a signed-in tool rather than an indexable site, so it talks to
 * the API directly from the browser with a bearer token. A 401 triggers one
 * silent refresh and a single retry; a second failure signs the user out rather
 * than looping.
 */

export function getAccessToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function storeSession(result: AuthResult): void {
  localStorage.setItem(ACCESS_KEY, result.accessToken);
  localStorage.setItem(REFRESH_KEY, result.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(result.user));
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * A back-office account is simply one holding any capability beyond the
 * bare self-service permission every account gets — `account.change_own_password`,
 * held even by a Customer role. Custom roles (owner's request) made a
 * fixed role-name check ("is this ADMIN/STAFF/TAILOR") meaningless: a
 * brand-new "Bookkeeper" role a super admin creates tomorrow must reach
 * /admin exactly as readily as the seeded ones, with no special-casing here.
 */
function hasBackOfficeAccess(permissions: readonly string[]): boolean {
  return permissions.some((key) => key !== 'account.change_own_password');
}

export async function login(identifier: string, password: string): Promise<AuthUser> {
  const body = await request<unknown>('/auth/login', {
    method: 'POST',
    body: { identifier, password },
    credentials: 'include',
    fallbackMessage: 'Sign-in failed',
  });

  const result = body as AuthResult;
  if (!hasBackOfficeAccess(result.user.permissions)) {
    throw new ApiError(403, 'This account does not have access to the back office.');
  }

  storeSession(result);
  return result.user;
}

/*
 * Single sign-on (docs/implementation/access-control-identity/161-sso-identity-federation.md).
 *
 * The browser leaves for the identity provider and comes back through the
 * API, which never puts a token in a URL: it leaves the session it issued in
 * a sealed, two-minute, httpOnly cookie that only `completeSsoSignIn()` can
 * redeem — once — for the same AuthResult a password sign-in returns. From
 * there the session is stored and refreshed exactly as `login()`'s is.
 */

/** The single sign-on buttons the sign-in screen offers. Empty when none is configured — or when the list cannot be read, since the password form works regardless. */
export async function listSsoSignInOptions(): Promise<SsoSignInOption[]> {
  try {
    return await request<SsoSignInOption[]>('/auth/sso/connections', { fallbackMessage: 'Could not load sign-in options' });
  } catch {
    return [];
  }
}

/** Where a "Sign in with …" button navigates: the API redirects the browser on to the identity provider. */
export function ssoStartUrl(connectionId: string): string {
  return `${API_URL}/auth/sso/${encodeURIComponent(connectionId)}/start`;
}

/** Redeems a just-completed single sign-on for a session, and stores it the way `login()` does. */
export async function completeSsoSignIn(): Promise<AuthUser> {
  const result = await request<AuthResult>('/auth/sso/session', {
    method: 'POST',
    credentials: 'include',
    fallbackMessage: 'Single sign-on did not complete. Try again, or sign in with your password.',
  });

  if (!hasBackOfficeAccess(result.user.permissions)) {
    throw new ApiError(
      403,
      'You are signed in, but this account has no back-office access yet. Ask an administrator to give it a role in Team & Access.',
    );
  }

  storeSession(result);
  return result.user;
}

export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  clearSession();

  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    credentials: 'include',
  }).catch(() => undefined);
}

/**
 * One refresh in flight per tab, however many requests hit a 401 together —
 * they all await it (206-rate-limiting-caching-compression-hardening.md §2.2).
 */
const refreshSession = singleFlight(async (): Promise<boolean> => {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    credentials: 'include',
  });

  if (!response.ok) return false;

  storeSession((await response.json()) as AuthResult);
  return true;
});

interface AdminRequestOptions {
  method?: string;
  body?: unknown;
  /** Sent as multipart/form-data; `body` is ignored when this is set. */
  formData?: FormData;
  query?: Record<string, unknown>;
  /** Set for endpoints that return CSV, or a downloadable file, rather than JSON. */
  expect?: 'json' | 'text' | 'blob';
  /** Extra headers — e.g. `Idempotency-Key` for a route guarded by `@IdempotentWrite`. */
  headers?: Record<string, string>;
}

/**
 * How the back office authenticates a request and recovers from a 401: the
 * bearer token, the single-flight refresh, and what to do when the session is
 * beyond saving. `adminFetch` passes it to `requestWithRefresh`; the upload
 * transport (`upload-client.ts`) reads the same object, because `fetch` cannot
 * report upload progress and a second copy of this would drift.
 */
export const adminAuth = {
  token: getAccessToken,
  refresh: refreshSession,
  onExpired: () => {
    clearSession();
    if (typeof window !== 'undefined') window.location.href = '/admin/login';
  },
  expiredMessage: 'Your session has expired. Please sign in again.',
};

export async function adminFetch<T>(
  path: string,
  options: AdminRequestOptions = {},
): Promise<T> {
  return requestWithRefresh<T>(
    path,
    {
      method: options.method ?? 'GET',
      body: options.formData ? undefined : options.body,
      formData: options.formData,
      query: options.query,
      expect: options.expect ?? 'json',
      credentials: 'include',
      headers: {
        Accept: options.expect === 'text' ? 'text/csv' : options.expect === 'blob' ? '*/*' : 'application/json',
        ...options.headers,
      },
    },
    adminAuth,
  );
}
