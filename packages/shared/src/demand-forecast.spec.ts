import { computeDemandForecast, resolveLeadTimeDays, suggestReorderQuantity, type DemandForecastSale } from './demand-forecast';

const NOW = new Date('2026-03-15T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

function saleOf(qty: number, days: number): DemandForecastSale {
  return { qty, occurredAt: daysAgo(days) };
}

/** This year's own trailing baseline: 90 sales, one per day, 1..90 days ago (never exactly "now"). */
function thisYearBaseline(qtyPerDay: number): DemandForecastSale[] {
  return Array.from({ length: 90 }, (_, i) => saleOf(qtyPerDay, i + 1));
}

/**
 * Last year's near-term window (395..366 days ago, 30 days) at `recentQtyPerDay`,
 * plus the rest of last year's own 90-day baseline (455..396 days ago, 60 days)
 * at `restQtyPerDay` — together they form lastYearBaselineUnits, of which the
 * near-term slice is a strict subset (both windows share the "365 days ago" anchor).
 */
function lastYear(recentQtyPerDay: number, restQtyPerDay: number): DemandForecastSale[] {
  return [
    ...Array.from({ length: 30 }, (_, i) => saleOf(recentQtyPerDay, i + 366)),
    ...Array.from({ length: 60 }, (_, i) => saleOf(restQtyPerDay, i + 396)),
  ];
}

describe('computeDemandForecast', () => {
  it('falls back to the trailing average alone with no year of history yet', () => {
    const result = computeDemandForecast({
      stock: 100,
      sales: thisYearBaseline(1),
      now: NOW,
      minLastYearUnits: 5,
      leadTimeDays: null,
    });

    expect(result.forecastedDailyDemand).toBeCloseTo(1, 5);
    expect(result.seasonalFactor).toBeNull();
    expect(result.reasonEn).toBeNull();
  });

  it('never trusts a seasonal factor built from too few units in last year\'s baseline', () => {
    const sales = [...thisYearBaseline(1), saleOf(3, 380)]; // 3 units total last year — below the minimum of 5

    const result = computeDemandForecast({ stock: 100, sales, now: NOW, minLastYearUnits: 5, leadTimeDays: null });

    expect(result.seasonalFactor).toBeNull();
    expect(result.forecastedDailyDemand).toBeCloseTo(1, 5);
  });

  it('scales the forecast up when last year ran hot around this same calendar window', () => {
    // Last year: near-term window at 3/day, the rest of the baseline at 1/day.
    const sales = [...thisYearBaseline(1), ...lastYear(3, 1)];

    const result = computeDemandForecast({ stock: 100, sales, now: NOW, minLastYearUnits: 5, leadTimeDays: null });

    expect(result.seasonalFactor).toBeGreaterThan(1.3);
    expect(result.forecastedDailyDemand).toBeGreaterThan(1);
    expect(result.reasonEn).toContain('higher');
  });

  it('scales the forecast down when last year ran cold around this same calendar window', () => {
    // Last year: near-term window at 0.2/day, the rest of the baseline at 2/day.
    const sales = [...thisYearBaseline(2), ...lastYear(0.2, 2)];

    const result = computeDemandForecast({ stock: 100, sales, now: NOW, minLastYearUnits: 5, leadTimeDays: null });

    expect(result.seasonalFactor).toBeLessThan(0.7);
    expect(result.forecastedDailyDemand).toBeLessThan(2);
    expect(result.reasonEn).toContain('lower');
  });

  it('never scales the forecast beyond the structural ratio between the near-term and baseline windows', () => {
    // Every unit of last year's baseline falls inside the near-term subset — the
    // most extreme case the 30-day-inside-90-day windowing can produce (a 3x
    // ceiling), never an unbounded multiplier from a single low-volume month.
    const sales = [...thisYearBaseline(1), ...lastYear(10, 0)];

    const result = computeDemandForecast({ stock: 100, sales, now: NOW, minLastYearUnits: 5, leadTimeDays: null });

    expect(result.seasonalFactor).toBeLessThanOrEqual(3);
  });

  it('floors a seasonal factor rather than zeroing the forecast from one quiet month last year', () => {
    const sales = [...thisYearBaseline(2), ...lastYear(0, 5)]; // near-term window sold nothing at all last year

    const result = computeDemandForecast({ stock: 100, sales, now: NOW, minLastYearUnits: 5, leadTimeDays: null });

    expect(result.seasonalFactor).toBeGreaterThanOrEqual(0.2);
    expect(result.forecastedDailyDemand).toBeGreaterThan(0);
  });

  it('never flags a projected stockout without a resolvable lead time', () => {
    const result = computeDemandForecast({
      stock: 10,
      sales: thisYearBaseline(5),
      now: NOW,
      minLastYearUnits: 5,
      leadTimeDays: null,
    });

    expect(result.projectedStockoutAt).toBeNull();
  });

  it('flags a projected stockout only when it falls before the reorder lead time allows a delivery', () => {
    // 5/day -> 10 units in stock lasts 2 days, well inside a 7-day lead time.
    const result = computeDemandForecast({
      stock: 10,
      sales: thisYearBaseline(5),
      now: NOW,
      minLastYearUnits: 5,
      leadTimeDays: 7,
    });

    expect(result.projectedStockoutAt).not.toBeNull();
    expect(result.projectedStockoutAt!.getTime()).toBeLessThan(NOW.getTime() + 7 * DAY_MS);
  });

  it('never flags a projected stockout when stock will outlast the lead time', () => {
    // 1/day -> 100 units lasts 100 days, well beyond a 7-day lead time.
    const result = computeDemandForecast({
      stock: 100,
      sales: thisYearBaseline(1),
      now: NOW,
      minLastYearUnits: 5,
      leadTimeDays: 7,
    });

    expect(result.projectedStockoutAt).toBeNull();
  });

  it('returns a zero forecast for a variant with no sales history at all', () => {
    const result = computeDemandForecast({ stock: 50, sales: [], now: NOW, minLastYearUnits: 5, leadTimeDays: 7 });

    expect(result.forecastedDailyDemand).toBe(0);
    expect(result.seasonalFactor).toBeNull();
    expect(result.projectedStockoutAt).toBeNull();
  });
});

describe('suggestReorderQuantity', () => {
  it('covers the lead time plus the safety buffer at the forecasted daily rate', () => {
    expect(suggestReorderQuantity(2, 7, 14)).toBe(42); // 2 * (7 + 14)
  });

  it('always suggests at least 1 unit when there is any demand at all', () => {
    expect(suggestReorderQuantity(0.01, 1, 0)).toBe(1);
  });

  it('suggests nothing for a variant with no forecasted demand', () => {
    expect(suggestReorderQuantity(0, 7, 14)).toBe(0);
  });
});

describe('resolveLeadTimeDays', () => {
  it('returns null for a variant with no preferred supplier', () => {
    expect(resolveLeadTimeDays(null, 'v1', new Map(), new Map())).toBeNull();
  });

  it('prefers a SupplierProduct override over the supplier\'s own default', () => {
    const defaults = new Map([['sup1', 7]]);
    const overrides = new Map([['sup1:v1', 21]]);

    expect(resolveLeadTimeDays('sup1', 'v1', defaults, overrides)).toBe(21);
  });

  it('falls back to the supplier\'s default lead time with no override', () => {
    const defaults = new Map([['sup1', 7]]);

    expect(resolveLeadTimeDays('sup1', 'v1', defaults, new Map())).toBe(7);
  });

  it('returns null when even the supplier\'s own default is missing', () => {
    expect(resolveLeadTimeDays('sup1', 'v1', new Map(), new Map())).toBeNull();
  });
});
