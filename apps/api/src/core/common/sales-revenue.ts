import type { OrderStatus } from '../prisma/client';

/**
 * The one place "does this order count as revenue" is decided. Every report
 * that claims to show "revenue" — analytics.service.ts's dashboard summary,
 * finance's expenses-vs-revenue ratio (WO-B.4), the comparative chart
 * (WO-B.5) — reads it from here, so two screens never show two different
 * numbers for the same fact. This repo already knows revenue four ways
 * (Order, JournalEntry, PosShift/CashMovement, plus this "sales" reading);
 * this file is the shared ground floor under the "sales" one, not a fifth.
 *
 * The rule itself: `Order.grandTotal`, summed where `status` is not one of
 * these, dated by `placedAt` — never `OrderEconomics.revenue`, which is a
 * different, narrower figure (WO-B.3's per-order contribution snapshot).
 */
export const VOID_ORDER_STATUSES: OrderStatus[] = ['CANCELLED', 'RETURNED'];
