'use client';

import { API_URL } from './api';
import { request, requestWithRefresh } from './api-client';
import type { AuthResult, AuthUser, CustomerOrder, CustomerReturnReason, CustomerReturnRequest } from '@/types/api';
import { STORAGE_KEYS } from '@/constants/storage';

const ACCESS_KEY = STORAGE_KEYS.customer.access;
const REFRESH_KEY = STORAGE_KEYS.customer.refresh;
const USER_KEY = STORAGE_KEYS.customer.user;

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
  await request('/auth/forgot-password', {
    method: 'POST',
    body: { email },
    expect: 'none',
    fallbackMessage: 'Could not send the reset email',
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await request('/auth/reset-password', {
    method: 'POST',
    body: { token, newPassword },
    expect: 'none',
    fallbackMessage: 'Could not reset your password',
  });
}

export async function verifyEmail(token: string): Promise<void> {
  await request('/auth/verify-email', {
    method: 'POST',
    body: { token },
    expect: 'none',
    fallbackMessage: 'Could not confirm your email address',
  });
}

export async function unsubscribeFromMarketing(userId: string, token: string): Promise<void> {
  await request('/email/unsubscribe', {
    method: 'POST',
    body: { userId, token },
    expect: 'none',
    fallbackMessage: 'Could not process this request',
  });
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

/**
 * One order, for whoever is allowed to see it.
 *
 * Two ways in, because an order has two kinds of reader. A signed-in customer
 * is authenticated; a guest proves it with the phone number the order was
 * placed with. Which check applies is the API's decision, not the page's —
 * order numbers on their own reveal nothing.
 */
export async function getMyOrder(number: string): Promise<CustomerOrder> {
  return customerFetch<CustomerOrder>(`/orders/${number}`);
}

export async function trackOrder(number: string, phone: string): Promise<CustomerOrder> {
  return request<CustomerOrder>(`/orders/${number}/track`, {
    method: 'POST',
    body: { phone },
    credentials: 'include',
    fallbackMessage: 'That number does not match this order',
  });
}

/** WO-6.6 — the customer's own side of returns/RMA. */
export async function listReturnReasons(): Promise<CustomerReturnReason[]> {
  return customerFetch<CustomerReturnReason[]>('/returns/reasons');
}

export async function listMyReturns(): Promise<CustomerReturnRequest[]> {
  return customerFetch<CustomerReturnRequest[]>('/returns/mine');
}

export async function getMyReturn(id: string): Promise<CustomerReturnRequest> {
  return customerFetch<CustomerReturnRequest>(`/returns/${id}`);
}

export async function createReturnRequest(input: {
  orderNumber: string;
  customerNote?: string;
  items: Array<{ orderItemId: string; reasonId: string; quantity: number }>;
}): Promise<CustomerReturnRequest> {
  return customerFetch<CustomerReturnRequest>('/returns', { method: 'POST', body: input });
}

/**
 * The two calls below stay on raw `fetch` deliberately.
 *
 * Logout is fire-and-forget — the local session is already gone, and a failed
 * request must not surface as an error. Refresh cannot go through the client
 * that calls it without recursing, and it answers a boolean rather than
 * throwing, which is the opposite of what `request` is for.
 */
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
