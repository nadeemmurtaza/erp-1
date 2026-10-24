/**
 * The one place a calendar-month billing period is computed from "now" —
 * shared by `BillingCron` (doc 50 §3) and `UsageMeteringCron` (doc 153 §2)
 * so the two never compute period boundaries by two slightly different
 * routes. UTC throughout, matching every other DateTime boundary in this
 * schema.
 */
export interface BillingPeriod {
  periodStart: Date;
  periodEnd: Date;
}

export function currentCalendarMonthPeriod(now: Date = new Date()): BillingPeriod {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
}
