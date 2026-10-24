const DAY_MS = 24 * 60 * 60 * 1000;
const SEASONAL_FACTOR_MIN = 0.2;
const SEASONAL_FACTOR_MAX = 5;
const NOTABLE_FACTOR_HIGH = 1.3;
const NOTABLE_FACTOR_LOW = 0.7;

export interface DemandForecastSale {
  qty: number;
  occurredAt: Date;
}

export interface DemandForecastInput {
  stock: number;
  /** Every SALE movement this variant has ever had — InventoryCron already fetches the whole history for units30/units90; this reuses it rather than issuing a second query per variant. */
  sales: DemandForecastSale[];
  now: Date;
  /** Minimum units in last year's own 90-day trailing baseline before a seasonalFactor is trusted at all. */
  minLastYearUnits: number;
  /** The resolved supplier lead time for this variant, or null when it has no preferred supplier. */
  leadTimeDays: number | null;
}

export interface DemandForecast {
  forecastedDailyDemand: number;
  seasonalFactor: number | null;
  /** Non-null ONLY when a reorder placed today, at this rate, would still arrive too late — the "flag stock that will run out before lead time allows a reorder to land" signal, not a general-purpose ETA. */
  projectedStockoutAt: Date | null;
  reasonEn: string | null;
}

/**
 * WO-9.3 (09-ai-layer.md) — "start with a simple seasonal model — trailing
 * average with a same-period-last-year factor — before reaching for anything
 * clever." Pure arithmetic, no AiProvider call: this year's own 90-day
 * trailing rate, nudged by how last year's near-term window compared to
 * that year's own trailing rate at the same point in the calendar. Kept
 * side-effect-free (no Prisma) so it can be unit tested directly.
 */
export function computeDemandForecast(input: DemandForecastInput): DemandForecast {
  const { stock, sales, now, minLastYearUnits, leadTimeDays } = input;

  const sumIn = (fromDaysAgo: number, toDaysAgo: number): number => {
    const from = new Date(now.getTime() - fromDaysAgo * DAY_MS);
    const to = new Date(now.getTime() - toDaysAgo * DAY_MS);
    return sales.filter((sale) => sale.occurredAt >= from && sale.occurredAt < to).reduce((sum, sale) => sum + sale.qty, 0);
  };

  const units90 = sumIn(90, 0);
  const baselineDailyDemand = units90 / 90;

  const lastYearRecentUnits = sumIn(395, 365);
  const lastYearBaselineUnits = sumIn(455, 365);

  let seasonalFactor: number | null = null;
  if (lastYearBaselineUnits >= minLastYearUnits) {
    const recentDailyLastYear = lastYearRecentUnits / 30;
    const baselineDailyLastYear = lastYearBaselineUnits / 90;
    if (baselineDailyLastYear > 0) {
      const raw = recentDailyLastYear / baselineDailyLastYear;
      seasonalFactor = Math.min(SEASONAL_FACTOR_MAX, Math.max(SEASONAL_FACTOR_MIN, raw));
    }
  }

  const forecastedDailyDemand = seasonalFactor !== null ? baselineDailyDemand * seasonalFactor : baselineDailyDemand;

  let reasonEn: string | null = null;
  if (seasonalFactor !== null && seasonalFactor >= NOTABLE_FACTOR_HIGH) {
    reasonEn = `Demand typically runs about ${seasonalFactor.toFixed(1)}x higher this time of year, based on last year.`;
  } else if (seasonalFactor !== null && seasonalFactor <= NOTABLE_FACTOR_LOW) {
    reasonEn = `Demand typically runs about ${seasonalFactor.toFixed(1)}x lower this time of year, based on last year.`;
  }

  let projectedStockoutAt: Date | null = null;
  if (forecastedDailyDemand > 0 && leadTimeDays !== null) {
    const daysUntilStockout = stock / forecastedDailyDemand;
    const stockoutAt = new Date(now.getTime() + daysUntilStockout * DAY_MS);
    const reorderDeadline = new Date(now.getTime() + leadTimeDays * DAY_MS);
    if (stockoutAt < reorderDeadline) {
      projectedStockoutAt = stockoutAt;
    }
  }

  return { forecastedDailyDemand, seasonalFactor, projectedStockoutAt, reasonEn };
}

/** ceil(days of lead time + safety buffer, at the forecasted daily rate) — the quantity a forecast-driven reorder suggests when no static ProductVariant.reorderQuantity is set. */
export function suggestReorderQuantity(forecastedDailyDemand: number, leadTimeDays: number, safetyStockDays: number): number {
  if (forecastedDailyDemand <= 0) return 0;
  return Math.max(1, Math.ceil(forecastedDailyDemand * (leadTimeDays + safetyStockDays)));
}

/**
 * A SupplierProduct.leadTimeDays override for this exact (supplier, variant)
 * pair, falling back to that Supplier's own default — shared by
 * InventoryCron (forecasting) and PurchasingCron (reorder quantity) so the
 * two crons can never resolve a different lead time for the same variant.
 * Callers batch-fetch both maps once per run; this function does no I/O.
 */
export function resolveLeadTimeDays(
  supplierId: string | null,
  variantId: string,
  defaultLeadTimeBySupplier: Map<string, number>,
  leadTimeOverrideBySupplierAndVariant: Map<string, number>,
): number | null {
  if (!supplierId) return null;
  return (
    leadTimeOverrideBySupplierAndVariant.get(`${supplierId}:${variantId}`) ??
    defaultLeadTimeBySupplier.get(supplierId) ??
    null
  );
}
