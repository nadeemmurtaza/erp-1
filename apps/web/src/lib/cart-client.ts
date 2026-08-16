'use client';

import { API_URL, ApiError } from './api';
import type { Cart } from './cart-types';

/**
 * Browser-side cart client.
 *
 * `credentials: 'include'` is what carries the cart cookie the API sets, so a
 * guest basket survives a refresh without any client-side storage. When the
 * customer is signed in, their access token is sent too and the API resolves
 * the account's cart instead — one cart, whichever device they are on.
 */

const ACCESS_KEY = 'yaseen.customer.access';

export function getCustomerToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY);
}

interface CartRequest {
  method?: string;
  body?: unknown;
  locale?: string;
}

async function cartFetch(path: string, options: CartRequest = {}): Promise<Cart> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  const token = getCustomerToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const query = options.locale ? `?locale=${options.locale}` : '';

  const response = await fetch(`${API_URL}/cart${path}${query}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'include',
  });

  const payload = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = (payload as { message?: string | string[] } | undefined)?.message;
    throw new ApiError(
      response.status,
      Array.isArray(message) ? message.join('\n') : (message ?? 'Could not update the cart'),
      payload,
    );
  }

  return payload as Cart;
}

export function fetchCart(locale: string): Promise<Cart> {
  return cartFetch('', { locale });
}

export interface AddToCartInput {
  variantId: string;
  quantity?: number;
  stitching?: {
    stitchingServiceId: string;
    measurementProfileId?: string;
    optionIds?: string[];
    notes?: string;
  };
}

export function addToCart(input: AddToCartInput, locale: string): Promise<Cart> {
  return cartFetch('/items', { method: 'POST', body: input, locale });
}

export function updateCartItem(
  itemId: string,
  patch: { quantity?: number; measurementProfileId?: string },
  locale: string,
): Promise<Cart> {
  return cartFetch(`/items/${itemId}`, { method: 'PATCH', body: patch, locale });
}

export function removeCartItem(itemId: string, locale: string): Promise<Cart> {
  return cartFetch(`/items/${itemId}`, { method: 'DELETE', locale });
}
