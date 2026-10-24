'use client';

import { trackEvent } from './analytics-client';
import { request } from './api-client';
import type { Cart } from '@/types/cart';
import { STORAGE_KEYS } from '@/constants/storage';

/**
 * Browser-side cart client.
 *
 * `credentials: 'include'` is what carries the cart cookie the API sets, so a
 * guest basket survives a refresh without any client-side storage. When the
 * customer is signed in, their access token is sent too and the API resolves
 * the account's cart instead — one cart, whichever device they are on.
 */

const ACCESS_KEY = STORAGE_KEYS.customer.access;

export function getCustomerToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY);
}

interface CartRequest {
  method?: string;
  body?: unknown;
  locale?: string;
}

/**
 * No 401 refresh here, unlike the admin and customer clients: a cart works
 * signed out. The token is attached when there is one so the cart merges into
 * the account, and its absence is a normal guest cart rather than an error.
 */
async function cartFetch(path: string, options: CartRequest = {}): Promise<Cart> {
  const token = getCustomerToken();

  return request<Cart>(`/cart${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    query: options.locale ? { locale: options.locale } : undefined,
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export function fetchCart(locale: string): Promise<Cart> {
  return cartFetch('', { locale });
}

export interface AddToCartInput {
  variantId: string;
  quantity?: number;
  stitching?: {
    garmentTypeId: string;
    stitchingServiceId?: string;
    measurementProfileId?: string;
    measurementValues?: Record<string, number>;
    optionIds?: string[];
    customDesignText?: Record<string, string>;
    /** Which RTW size the measurements were prefilled from, if any. */
    sizeToken?: string;
    notes?: string;
  };
}

export async function addToCart(input: AddToCartInput, locale: string): Promise<Cart> {
  const cart = await cartFetch('/items', { method: 'POST', body: input, locale });
  // Fired only once the line has actually been added — not on a failed
  // request, since cartFetch throws before this point on a non-OK response.
  trackEvent('add_to_cart', { meta: { variantId: input.variantId, quantity: input.quantity } });
  return cart;
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

/**
 * WO-8.5 — captures a guest's phone and marketing consent onto the cart as
 * soon as they're typed at checkout, before the order exists. A no-op
 * server-side for a signed-in customer (their account email already covers
 * this), so it's safe to call unconditionally from the checkout form.
 */
export function updateGuestContact(
  phone: string,
  marketingConsent: boolean,
  locale: string,
): Promise<Cart> {
  return cartFetch('/guest-contact', { method: 'PATCH', body: { phone, marketingConsent }, locale });
}
