'use client';

import { ApiError, API_URL } from './api';
import { request, requestWithRefresh } from './api-client';
import type { AuthResult, AuthUser } from '@/types/api';
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

async function refreshSession(): Promise<boolean> {
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
}

interface AdminRequestOptions {
  method?: string;
  body?: unknown;
  /** Sent as multipart/form-data; `body` is ignored when this is set. */
  formData?: FormData;
  query?: Record<string, unknown>;
  /** Set for endpoints that return CSV, or a downloadable file, rather than JSON. */
  expect?: 'json' | 'text' | 'blob';
}

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
      },
    },
    {
      token: getAccessToken,
      refresh: refreshSession,
      onExpired: () => {
        clearSession();
        if (typeof window !== 'undefined') window.location.href = '/admin/login';
      },
      expiredMessage: 'Your session has expired. Please sign in again.',
    },
  );
}
