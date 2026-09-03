import { formatMoney, type Locale } from '../constants';
import { getPersonFullName, type PersonLike } from './person';

/**
 * Order getters. Structurally typed — see the note in person.ts. Each
 * function takes only the fields it actually reads (matching pricing.ts's
 * convention of narrow, function-specific input types) rather than one
 * bloated "OrderLike" every caller has to over-select for.
 */
export interface OrderItemLike {
  quantity: number;
}

/** "Ready To Ship" from "READY_TO_SHIP" — every OrderStatus value formats the same way. */
export function getOrderStatusLabel(order: { status: string }): string {
  return order.status
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * The name on the order, not necessarily the account's current name.
 * `guestName` is a checkout-time snapshot written for every order, not only
 * guest ones (House Rule 7 — order lines are snapshots) — it wins over the
 * live `user` relation, which may have changed since. Only falls back to
 * `user` for a legacy or manually-created row with no snapshot at all.
 */
export function getOrderCustomerName(order: {
  guestName?: string | null;
  /** Present when the order was placed by a registered account. */
  user?: PersonLike | null;
}): string | null {
  const snapshot = order.guestName?.trim();
  if (snapshot) return snapshot;
  return order.user ? getPersonFullName(order.user) : null;
}

/** grandTotal formatted, e.g. "Rs 3,499". */
export function getOrderDisplayTotal(order: { grandTotal: number }, locale: Locale = 'en'): string {
  return formatMoney(order.grandTotal, locale);
}

/** Total units across every line, not the number of distinct lines. */
export function getOrderItemCount(order: { items?: OrderItemLike[] }): number {
  return (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
}
