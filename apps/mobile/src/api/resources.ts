import { api, setCartToken, storeTokens, type RequestOptions } from './client';
import type {
  AuthResult,
  Booking,
  Cart,
  GarmentType,
  MeasurementProfile,
  Order,
  Paginated,
  PaymentMethod,
  Product,
  StitchingOptionGroup,
  WorkshopJob,
} from './types';
import type { Locale, StitchingStage } from '@newax/shared';

/**
 * Every call the app makes, named.
 *
 * Screens never build a path or a query string themselves — when the API
 * changes, it changes here once.
 */

// --- Catalogue --------------------------------------------------------------

export function listProducts(query: {
  locale: Locale;
  page?: number;
  pageSize?: number;
  q?: string;
  category?: string;
  kind?: string;
  sort?: string;
}): Promise<Paginated<Product>> {
  return api('/catalog/products', { query, anonymous: true });
}

export function getProduct(slug: string, locale: Locale): Promise<Product> {
  return api(`/catalog/products/${slug}`, { query: { locale }, anonymous: true });
}

export function listStitchingServices(garmentType: string, locale: Locale): Promise<Product[]> {
  return api('/catalog/stitching-services', {
    query: { garmentType, locale },
    anonymous: true,
  });
}

export function listOptionGroups(garmentType: string): Promise<StitchingOptionGroup[]> {
  return api('/stitching/option-groups', { query: { garmentType }, anonymous: true });
}

// --- Cart -------------------------------------------------------------------

/** Every cart response carries the token, so it is stored on the way through. */
async function withToken(promise: Promise<Cart>): Promise<Cart> {
  const cart = await promise;
  if (cart.token) await setCartToken(cart.token);
  return cart;
}

export function getCart(locale: Locale): Promise<Cart> {
  return withToken(api('/cart', { query: { locale } }));
}

export function addToCart(body: {
  variantId: string;
  quantity?: number;
  stitching?: {
    stitchingServiceId: string;
    measurementProfileId?: string;
    optionIds: string[];
    notes?: string;
  };
}): Promise<Cart> {
  return withToken(api('/cart/items', { method: 'POST', body }));
}

export function updateCartItem(itemId: string, quantity: number): Promise<Cart> {
  return withToken(api(`/cart/items/${itemId}`, { method: 'PATCH', body: { quantity } }));
}

export function removeCartItem(itemId: string): Promise<Cart> {
  return withToken(api(`/cart/items/${itemId}`, { method: 'DELETE' }));
}

export function mergeCart(token: string): Promise<Cart> {
  return withToken(api('/cart/merge', { method: 'POST', body: { token } }));
}

// --- Auth -------------------------------------------------------------------

export async function login(identifier: string, password: string): Promise<AuthResult> {
  const result = await api<AuthResult>('/auth/login', {
    method: 'POST',
    body: { identifier, password },
    anonymous: true,
  });

  await storeTokens(result.accessToken, result.refreshToken);
  return result;
}

export function logout(refreshToken: string | null): Promise<void> {
  return api('/auth/logout', { method: 'POST', body: { refreshToken } });
}

// --- Measurements -----------------------------------------------------------

export function listGarmentTypes(): Promise<GarmentType[]> {
  return api('/measurements/garment-types', { anonymous: true });
}

export function listProfiles(): Promise<MeasurementProfile[]> {
  return api('/measurements/profiles');
}

export function createProfile(body: {
  garmentTypeId: string;
  label: string;
  values: Record<string, number>;
  isDefault?: boolean;
}): Promise<MeasurementProfile> {
  return api('/measurements/profiles', { method: 'POST', body });
}

export function updateProfile(
  id: string,
  body: { label?: string; values?: Record<string, number> },
): Promise<MeasurementProfile> {
  return api(`/measurements/profiles/${id}`, { method: 'PATCH', body });
}

export function deleteProfile(id: string): Promise<void> {
  return api(`/measurements/profiles/${id}`, { method: 'DELETE' });
}

// --- Orders -----------------------------------------------------------------

export function placeOrder(body: {
  shippingAddress: Record<string, unknown>;
  paymentMethod: string;
  customerNote?: string;
}): Promise<Order> {
  return api('/orders', { method: 'POST', body });
}

export function myOrders(page = 1): Promise<Paginated<Order>> {
  return api('/orders/mine', { query: { page, pageSize: 20 } });
}

export function getOrder(number: string): Promise<Order> {
  return api(`/orders/${number}`);
}

export function trackOrder(number: string, phone: string): Promise<Order> {
  return api(`/orders/${number}/track`, { method: 'POST', body: { phone }, anonymous: true });
}

export function uploadReceipt(paymentId: string, file: FormDataFile): Promise<unknown> {
  const form = new FormData();
  // React Native's FormData takes {uri, name, type}; the web File type does not
  // describe it, so the shape is declared here rather than cast at the caller.
  form.append('receipt', file as unknown as Blob);
  return api(`/payments/${paymentId}/receipt`, { method: 'POST', formData: form });
}

export interface FormDataFile {
  uri: string;
  name: string;
  type: string;
}

export function paymentMethods(): Promise<PaymentMethod[]> {
  return api('/payments/methods', { anonymous: true });
}

// --- Stitching --------------------------------------------------------------

export function bookStitching(body: {
  name: string;
  phone: string;
  email?: string;
  garments: Array<{
    garmentTypeId: string;
    measurementProfileId?: string;
    measurements?: Record<string, number>;
    instructions?: string;
  }>;
  pickupAddress?: Record<string, unknown>;
  fabricNotes?: string;
}): Promise<Booking> {
  return api('/stitching/bookings', { method: 'POST', body });
}

export function trackBooking(number: string, phone: string): Promise<Booking> {
  return api(`/stitching/bookings/${number}/track`, {
    method: 'POST',
    body: { phone },
    anonymous: true,
  });
}

// --- The workshop, for tailors ---------------------------------------------

export function listJobs(query: { mine?: boolean; stage?: StitchingStage; overdue?: boolean }) {
  return api<WorkshopJob[]>('/admin/stitching/jobs', {
    query: {
      mine: query.mine ? 'true' : undefined,
      stage: query.stage,
      overdue: query.overdue ? 'true' : undefined,
    },
  });
}

export function getJob(id: string): Promise<WorkshopJob> {
  return api(`/admin/stitching/jobs/${id}`);
}

export function changeJobStage(
  id: string,
  stage: StitchingStage,
  note?: string,
): Promise<WorkshopJob> {
  return api(`/admin/stitching/jobs/${id}/stage`, { method: 'POST', body: { stage, note } });
}

// --- Push notifications -----------------------------------------------------

export function registerDevice(body: {
  token: string;
  platform?: 'IOS' | 'ANDROID' | 'WEB';
  appVersion?: string;
  locale?: string;
}): Promise<unknown> {
  return api('/me/devices', { method: 'POST', body });
}

export function unregisterDevice(token: string): Promise<void> {
  return api(`/me/devices/${encodeURIComponent(token)}`, { method: 'DELETE' });
}

export type { RequestOptions };
