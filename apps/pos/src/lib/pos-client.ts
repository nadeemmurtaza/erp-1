'use client';

import { request } from './api-client';

export interface PosTerminal {
  id: string;
  code: string;
  label: string;
  locationId: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
}

export interface PosShift {
  id: string;
  terminalId: string;
  openedByUserId: string;
  closedByUserId: string | null;
  openingCashMinor: number;
  closingCashMinor: number | null;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
}

export interface CashBreakdown {
  expectedCashMinor: number;
  openingFloatMinor: number;
  cashInMinor: number;
  cashOutMinor: number;
  dropMinor: number;
  paidOutMinor: number;
}

export interface ZReport extends CashBreakdown {
  closingCashMinor: number;
  overShortMinor: number;
}

export interface PosVariant {
  variantId: string;
  productId: string;
  sku: string;
  barcode: string | null;
  nameEn: string;
  unitPrice: number;
  stock: number;
}

export interface PosOrderItem {
  nameEn: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PosOrder {
  id: string;
  number: string;
  status: string;
  channel: string;
  locationId: string | null;
  terminalId: string | null;
  shiftId: string | null;
  itemsSubtotal: number;
  grandTotal: number;
  placedAt: string;
  items: PosOrderItem[];
  payment: { provider: string; status: string; amount: number };
}

/** pos-hardware/31 §2 — a modifier changes the till total ("extra shot"). */
export interface PosLineModifierRequest {
  key: string;
  label: string;
  priceDeltaMinor: number;
}

/** pos-hardware/31 §2 — where a line's quantity came from, when not typed. */
export type PosLineQuantitySourceRequest =
  | { source: 'TYPED' }
  | { source: 'SCALE_WEIGHT' }
  | { source: 'BOM_RECIPE_SCALE'; recipeId: string };

export interface PosSaleLine {
  variantId: string;
  quantity: number;
  lineRef?: string;
  modifiers?: PosLineModifierRequest[];
  quantitySource?: PosLineQuantitySourceRequest;
}

/** pos-hardware/31 §3 (WO-31.3) — a sale started but not yet tendered. */
export interface PosParkedSale {
  id: string;
  shiftId: string;
  orderType: 'COUNTER' | 'TAB' | 'TABLE';
  label: string;
  basketSnapshot: unknown;
  parkedAt: string;
  retrievedAt: string | null;
}

/** pos-hardware/31 §1/WO-31.4 — a sellable BOM recipe, for a BOM_RECIPE_SCALE line. */
export interface PosSellableRecipe {
  recipeId: string;
  variantId: string;
  sku: string;
  nameEn: string;
  unitPrice: number;
}

/** finance-accounting/151-layby-installment-sales.md — requested at the point of sale. */
export interface PosInstalmentPlanRequest {
  type: 'LAYBY' | 'INSTALMENT';
  depositMinor: number;
  schedule: { dueDate: string; amountMinor: number }[];
}

export interface PosSaleRequest {
  lines: PosSaleLine[];
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  instalmentPlan?: PosInstalmentPlanRequest;
}

export interface PosReceiptData {
  orderNumber: string;
  placedAt: string;
  terminalId: string | null;
  cashierUserId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  lines: PosOrderItem[];
  itemsSubtotal: number;
  grandTotal: number;
  paymentProvider: string | null;
  printCount: number;
  printedAt: string | null;
}

export interface AdminOrderSummary {
  id: string;
  number: string;
  status: string;
  channel: string;
  grandTotal: number;
  placedAt: string;
  guestName: string | null;
}

export interface AdminOrderPayment {
  id: string;
  provider: string;
  status: string;
  amount: number;
}

export interface AdminOrderDetail extends AdminOrderSummary {
  items: PosOrderItem[];
  payments: AdminOrderPayment[];
}

/**
 * Terminal setup is a one-time, admin-tier action (`pos.manage`, not
 * `pos.operate`) — a plain cashier session 403s here, which is correct: the
 * device only needs listing this once, by whoever provisions it, before a
 * cashier ever signs in on it. See the /terminal screen.
 */
export function listTerminals(): Promise<{ data: PosTerminal[] }> {
  return request('/admin/pos/terminals');
}

export function searchProducts(terminalId: string, q: string): Promise<{ data: PosVariant[] }> {
  return request(`/admin/pos/products/search`, { query: { terminalId, q } });
}

/** pos-hardware/31 WO-31.4 — sellable BOM recipes, for a BOM_RECIPE_SCALE line. */
export function listSellableRecipes(): Promise<{ data: PosSellableRecipe[] }> {
  return request('/admin/pos/products/recipes');
}

/** pos-hardware/76-pos-mobile-dashboard.md WO-76.1 — scoped to one terminal's own location. */
export interface PosDashboardSummary {
  dailySales: { revenue: number; orderCount: number };
  totalCustomers: number;
  lowStockVariants: Array<{
    variantId: string;
    sku: string;
    productName: string;
    variantLabel: string;
    stock: number;
    reorderPoint: number;
  }>;
}

export function getDashboardSummary(terminalId: string): Promise<PosDashboardSummary> {
  return request('/admin/pos/dashboard', { query: { terminalId } });
}

export function openShift(terminalId: string, openingCashMinor: number): Promise<PosShift> {
  return request('/admin/pos/shifts/open', { method: 'POST', body: { terminalId, openingCashMinor } });
}

export function closeShift(shiftId: string, closingCashMinor: number): Promise<PosShift> {
  return request(`/admin/pos/shifts/${shiftId}/close`, { method: 'POST', body: { closingCashMinor } });
}

export function xReport(shiftId: string): Promise<CashBreakdown> {
  return request(`/admin/pos/shifts/${shiftId}/x-report`);
}

export function zReport(shiftId: string): Promise<ZReport> {
  return request(`/admin/pos/shifts/${shiftId}/z-report`);
}

export function recordCashMovement(
  shiftId: string,
  type: 'CASH_IN' | 'CASH_OUT' | 'DROP' | 'PAID_OUT',
  amountMinor: number,
  reason?: string,
) {
  return request(`/admin/pos/shifts/${shiftId}/cash-movements`, { method: 'POST', body: { type, amountMinor, reason } });
}

/**
 * architecture-patterns/157 — `idempotencyKey` is generated once, at the
 * moment the sale is first attempted, and resent unchanged on every retry
 * (the immediate one here, and any later outbox-sync retry of the same
 * queued sale) so a lost response or a flaky reconnect collapses to the
 * one order the till already promised the customer, never a second one.
 */
export function sell(shiftId: string, sale: PosSaleRequest, idempotencyKey: string): Promise<PosOrder> {
  return request(`/admin/pos/shifts/${shiftId}/sales`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: sale,
  });
}

/** pos-hardware/31 WO-31.3 — park a TAB/TABLE sale in progress. A COUNTER sale is refused server-side. */
export function parkSale(
  shiftId: string,
  orderType: 'TAB' | 'TABLE',
  label: string,
  basketSnapshot: unknown,
): Promise<PosParkedSale> {
  return request(`/admin/pos/shifts/${shiftId}/parked-sales`, {
    method: 'POST',
    body: { orderType, label, basketSnapshot },
  });
}

/** Idempotent — retrieving an already-retrieved sale is refused (409). */
export function retrieveParkedSale(shiftId: string, parkedSaleId: string): Promise<PosParkedSale> {
  return request(`/admin/pos/shifts/${shiftId}/parked-sales/${parkedSaleId}/retrieve`, { method: 'POST' });
}

export function listParkedSales(shiftId: string): Promise<{ data: PosParkedSale[] }> {
  return request(`/admin/pos/shifts/${shiftId}/parked-sales`);
}

export function getReceipt(orderId: string): Promise<PosReceiptData> {
  return request(`/admin/pos/receipts/${orderId}`);
}

/** Marks the receipt printed and returns its data — call right before `window.print()`. */
export function printReceipt(orderId: string): Promise<PosReceiptData> {
  return request(`/admin/pos/receipts/${orderId}/print`, { method: 'POST' });
}

/**
 * Order lookup and the return path reuse the EXISTING admin/orders and
 * admin/payments endpoints directly — `orders.manage` and `payments.approve`
 * (STAFF holds both by default), not a new pos-specific return endpoint.
 * "Exchange" is this same return, followed by a new sale on the till screen
 * — no separate atomic model, WO-21.5's own documented scope.
 */
export function searchOrders(q: string): Promise<{ data: AdminOrderSummary[] }> {
  return request('/admin/orders', { query: { q, pageSize: 10 } });
}

export function getOrder(orderId: string): Promise<AdminOrderDetail> {
  return request(`/admin/orders/${orderId}`);
}

export function returnOrder(orderId: string, note?: string): Promise<AdminOrderDetail> {
  return request(`/admin/orders/${orderId}/status`, { method: 'POST', body: { status: 'RETURNED', note } });
}

export function refundPayment(paymentId: string, amount?: number, note?: string) {
  return request(`/admin/payments/${paymentId}/refund`, { method: 'POST', body: { amount, note } });
}
