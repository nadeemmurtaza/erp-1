'use client';

import { API_URL, ApiError } from './api';
import type { AuthResult, AuthUser } from './api-types';

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
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, messageOf(body) ?? 'Registration failed', body);
  }

  const result = body as AuthResult;
  storeSession(result);
  return result.user;
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

async function _refreshCustomerSession(): Promise<boolean> {
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

function messageOf(body: unknown): string | undefined {
  const message = (body as { message?: string | string[] } | undefined)?.message;
  if (!message) return undefined;
  return Array.isArray(message) ? message.join('\n') : String(message);
}
