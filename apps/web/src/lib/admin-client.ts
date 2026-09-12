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

export const BACK_OFFICE_ROLES = ['ADMIN', 'STAFF', 'TAILOR'] as const;

export async function login(identifier: string, password: string): Promise<AuthUser> {
  const body = await request<unknown>('/auth/login', {
    method: 'POST',
    body: { identifier, password },
    credentials: 'include',
    fallbackMessage: 'Sign-in failed',
  });

  const result = body as AuthResult;
  if (!BACK_OFFICE_ROLES.includes(result.user.role as (typeof BACK_OFFICE_ROLES)[number])) {
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
  /** Set for endpoints that return CSV rather than JSON. */
  expect?: 'json' | 'text';
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
      headers: { Accept: options.expect === 'text' ? 'text/csv' : 'application/json' },
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
