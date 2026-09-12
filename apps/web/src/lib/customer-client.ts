'use client';

import { API_URL, ApiError } from './api';
import { messageOf, request, requestWithRefresh } from './api-client';
import type { AuthResult, AuthUser } from '@/types/api';

const ACCESS_KEY = 'yaseen.customer.access';
const REFRESH_KEY = 'yaseen.customer.refresh';
const USER_KEY = 'yaseen.customer.user';

export function getCustomerToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY);
}

export function getStoredCustomerUser(): AuthUser | null {
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

export function clearCustomerSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function loginCustomer(identifier: string, password: string): Promise<AuthUser> {
  const body = await request<unknown>('/auth/login', {
    method: 'POST',
    body: { identifier, password },
    credentials: 'include',
    fallbackMessage: 'Sign-in failed',
  });

  const result = body as AuthResult;
  storeSession(result);
  return result.user;
}

export async function registerCustomer(input: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}): Promise<AuthUser> {
  const body = await request<unknown>('/auth/register', {
    method: 'POST',
    body: input,
    credentials: 'include',
    fallbackMessage: 'Registration failed',
  });

  const result = body as AuthResult;
  storeSession(result);
  return result.user;
}

export async function forgotPassword(email: string): Promise<void> {
  const response = await fetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, messageOf(body) ?? 'Could not send the reset email', body);
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const response = await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, messageOf(body) ?? 'Could not reset your password', body);
  }
}

export async function verifyEmail(token: string): Promise<void> {
  const response = await fetch(`${API_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      messageOf(body) ?? 'Could not confirm your email address',
      body,
    );
  }
}

export async function unsubscribeFromMarketing(userId: string, token: string): Promise<void> {
  const response = await fetch(`${API_URL}/email/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, token }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, messageOf(body) ?? 'Could not process this request', body);
  }
}

export async function logoutCustomer(): Promise<void> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  clearCustomerSession();

  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    credentials: 'include',
  }).catch(() => undefined);
}

async function refreshCustomerSession(): Promise<boolean> {
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

interface CustomerRequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, unknown>;
}

/** Authenticated fetch for a signed-in customer's own data — addresses, measurement profiles, order history, profile edits. */
export async function customerFetch<T>(
  path: string,
  options: CustomerRequestOptions = {},
): Promise<T> {
  return requestWithRefresh<T>(
    path,
    {
      method: options.method ?? 'GET',
      body: options.body,
      query: options.query,
      credentials: 'include',
    },
    {
      token: getCustomerToken,
      refresh: refreshCustomerSession,
      // No redirect here, unlike admin: a customer hitting an expired session
      // mid-browse should land back where they were once they sign in, and the
      // page that called this decides where that is.
      onExpired: clearCustomerSession,
      expiredMessage: 'Your session has expired. Please sign in again.',
    },
  );
}
