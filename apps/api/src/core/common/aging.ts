/**
 * FIFO invoice aging (RETAIL-ERP.md R15, WO-19.4) — a pure function over one
 * counterparty's movements on a control account (Accounts Receivable or
 * Accounts Payable), so it is unit-testable without a database.
 *
 * A "movement" is one JournalLine on that control account, reduced to a
 * signed amount: positive is an origination (a sale for AR, a bill for AP),
 * negative is a settlement (a receipt for AR, a payment for AP) — the
 * caller applies the sign convention (accountId's debit/credit meaning
 * differs between AR and AP), this function only ever sums and buckets.
 *
 * Settlements are matched against originations oldest-first (FIFO), not
 * against any specific invoice they were meant for — this codebase has no
 * per-payment-to-invoice matching yet, so FIFO is the standard, defensible
 * approximation every aging report without one uses. What remains
 * unconsumed on each origination ages from that origination's own date.
 *
 * Lives in core/common rather than the accounting module: WO-4.6's own CSV
 * exports (apps/api/src/modules/money/reports/reports.service.ts) age the same
 * ledger movements for a spreadsheet, and core is the one place any module
 * may depend on (scripts/check-module-boundaries.mjs) — moved here rather
 * than added to KNOWN_MODULE_COUPLINGS, which is reserved for same-
 * transaction writes, not a shared read-only calculation.
 */

export interface AgingMovement {
  date: Date;
  /** Positive = origination, negative = settlement. Never zero. */
  amountMinor: number;
}

export interface AgingBuckets {
  /** 0-30 days old. */
  current: number;
  /** 31-60 days old. */
  days31to60: number;
  /** 61-90 days old. */
  days61to90: number;
  /** 91+ days old. */
  over90: number;
}

export function totalAgingBuckets(buckets: AgingBuckets): number {
  return buckets.current + buckets.days31to60 + buckets.days61to90 + buckets.over90;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function ageMovements(movements: readonly AgingMovement[], asOf: Date): AgingBuckets {
  const originations = movements
    .filter((m) => m.amountMinor > 0)
    .map((m) => ({ date: m.date, remaining: m.amountMinor }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let settlementPool = movements
    .filter((m) => m.amountMinor < 0)
    .reduce((sum, m) => sum - m.amountMinor, 0);

  const buckets: AgingBuckets = { current: 0, days31to60: 0, days61to90: 0, over90: 0 };

  for (const origination of originations) {
    const consumed = Math.min(settlementPool, origination.remaining);
    origination.remaining -= consumed;
    settlementPool -= consumed;
    if (origination.remaining <= 0) continue;

    const ageDays = Math.floor((asOf.getTime() - origination.date.getTime()) / DAY_MS);
    if (ageDays <= 30) buckets.current += origination.remaining;
    else if (ageDays <= 60) buckets.days31to60 += origination.remaining;
    else if (ageDays <= 90) buckets.days61to90 += origination.remaining;
    else buckets.over90 += origination.remaining;
  }

  return buckets;
}
