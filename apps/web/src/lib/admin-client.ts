'use client';

import { API_URL, ApiError, toSearchParams } from './api';
import type { AuthResult, AuthUser } from './api-types';

const ACCESS_KEY = 'yaseen.admin.access';
const REFRESH_KEY = 'yaseen.admin.refresh';
const USER_KEY = 'yaseen.admin.user';

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
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
    credentials: 'include',
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, messageOf(body) ?? 'Sign-in failed', body);
  }

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
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {
      Accept: options.expect === 'text' ? 'text/csv' : 'application/json',
    };

    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let body: BodyInit | undefined;
    if (options.formData) {
      // Let the browser set the multipart boundary itself.
      body = options.formData;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    return fetch(`${API_URL}${path}${toSearchParams(options.query ?? {})}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      credentials: 'include',
    });
  };

  let response = await send();

  if (response.status === 401 && (await refreshSession())) {
    response = await send();
  }

  if (response.status === 401) {
    clearSession();
    if (typeof window !== 'undefined') {
      window.location.href = '/admin/login';
    }
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => undefined);
    throw new ApiError(
      response.status,
      messageOf(errorBody) ?? `Request failed with ${response.status}`,
      errorBody,
    );
  }

  if (response.status === 204) return undefined as T;
  if (options.expect === 'text') return (await response.text()) as T;

  return (await response.json()) as T;
}

function messageOf(body: unknown): string | undefined {
  const message = (body as { message?: string | string[] } | undefined)?.message;
  if (!message) return undefined;
  return Array.isArray(message) ? message.join('\n') : String(message);
}
