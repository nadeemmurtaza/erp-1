import { api, setCartToken, storeTokens, type RequestOptions } from './client';
import type {
  AuthResult,
  Booking,
  Cart,
  GarmentType,
  LoyaltyBalance,
  LoyaltyLedgerEntry,
  LoyaltyTier,
  MeasurementProfile,
  NotificationPreferenceCell,
  Order,
  Paginated,
  PaymentMethod,
  Product,
  Referral,
  Review,
  ReturnReason,
  ReturnRequest,
  StitchingOptionGroup,
  StoreCreditLedgerEntry,
  WishlistItem,
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

// --- Wishlist (WO-7.6) -------------------------------------------------------

export function listWishlist(): Promise<WishlistItem[]> {
  return api('/wishlist');
}

export function addToWishlist(productId: string, variantId?: string): Promise<WishlistItem> {
  return api('/wishlist', { method: 'POST', body: { productId, variantId } });
}

export function removeFromWishlist(id: string): Promise<{ removed: boolean }> {
  return api(`/wishlist/${id}`, { method: 'DELETE' });
}

export function requestBackInStockAlert(variantId: string): Promise<{ requested: boolean }> {
  return api('/back-in-stock', { method: 'POST', body: { variantId } });
}

export function cancelBackInStockAlert(variantId: string): Promise<{ cancelled: boolean }> {
  return api(`/back-in-stock/${variantId}`, { method: 'DELETE' });
}

// --- Reviews (WO-7.5) ---------------------------------------------------------

export function productReviews(productId: string, page = 1): Promise<Paginated<Review>> {
  return api(`/products/${productId}/reviews`, { query: { page, pageSize: 20 }, anonymous: true });
}

export function myReviews(): Promise<Review[]> {
  return api('/reviews/mine');
}

export function submitReview(body: {
  productId: string;
  rating: number;
  title?: string;
  body?: string;
}): Promise<Review> {
  return api('/reviews', { method: 'POST', body });
}

export function markReviewHelpful(id: string): Promise<Review> {
  return api(`/reviews/${id}/helpful`, { method: 'POST', anonymous: true });
}

// --- Returns / RMA (WO-6.6) ---------------------------------------------------

export function listReturnReasons(): Promise<ReturnReason[]> {
  return api('/returns/reasons');
}

export function myReturns(): Promise<ReturnRequest[]> {
  return api('/returns/mine');
}

export function getReturn(id: string): Promise<ReturnRequest> {
  return api(`/returns/${id}`);
}

export function createReturn(body: {
  orderNumber: string;
  customerNote?: string;
  items: Array<{ orderItemId: string; reasonId: string; quantity: number }>;
}): Promise<ReturnRequest> {
  return api('/returns', { method: 'POST', body });
}

// --- Loyalty and referrals (WO-7.7) ------------------------------------------

export function loyaltyTiers(): Promise<LoyaltyTier[]> {
  return api('/loyalty/tiers', { anonymous: true });
}

export function loyaltyBalance(): Promise<LoyaltyBalance> {
  return api('/loyalty');
}

export function loyaltyLedger(page = 1): Promise<Paginated<LoyaltyLedgerEntry>> {
  return api('/loyalty/ledger', { query: { page, pageSize: 50 } });
}

export function redeemLoyaltyPoints(points: number): Promise<{ storeCreditAdded: number }> {
  return api('/loyalty/redeem', { method: 'POST', body: { points } });
}

export function myReferralCode(): Promise<{ code: string }> {
  return api('/loyalty/referral-code');
}

export function myReferrals(): Promise<Referral[]> {
  return api('/loyalty/referrals');
}

export function applyReferralCode(code: string): Promise<Referral> {
  return api('/loyalty/referral/apply', { method: 'POST', body: { code } });
}

// --- Store credit and gift cards (WO-7.4) -------------------------------------

export function storeCreditBalance(): Promise<{ balance: number }> {
  return api('/store-credit');
}

export function storeCreditLedger(page = 1): Promise<Paginated<StoreCreditLedgerEntry>> {
  return api('/store-credit/ledger', { query: { page, pageSize: 50 } });
}

export function redeemGiftCardIntoAccount(code: string): Promise<unknown> {
  return api('/gift-cards/redeem-into-account', { method: 'POST', body: { code } });
}

// --- Notification preferences (WO-7.8) ---------------------------------------

export function getNotificationPreferences(): Promise<NotificationPreferenceCell[]> {
  return api('/notification-preferences');
}

export function updateNotificationPreferences(
  updates: NotificationPreferenceCell[],
): Promise<NotificationPreferenceCell[]> {
  return api('/notification-preferences', { method: 'PUT', body: { updates } });
}

// --- Reorder (WO-7.2) ----------------------------------------------------------

export interface ReorderResult {
  cart: Cart;
  addedCount: number;
  unavailable: string[];
}

export async function reorder(orderNumber: string): Promise<ReorderResult> {
  const result = await api<ReorderResult>(`/cart/reorder/${orderNumber}`, { method: 'POST' });
  if (result.cart.token) await setCartToken(result.cart.token);
  return result;
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
