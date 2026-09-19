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

export interface PosSaleLine {
  variantId: string;
  quantity: number;
}

export interface PosSaleRequest {
  lines: PosSaleLine[];
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
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

export function sell(shiftId: string, sale: PosSaleRequest): Promise<PosOrder> {
  return request(`/admin/pos/shifts/${shiftId}/sales`, { method: 'POST', body: sale });
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
