'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { formatMoney } from '@yaseen/shared';
import { adminFetch } from '@/lib/admin-client';

interface StitchingAnalytics {
  topGarments: Array<{ key: string; label: string; jobs: number; revenue: number }>;
  topOptions: Array<{ groupKey: string; label: string; count: number; revenue: number }>;
  revenueByGarment: Array<{ label: string; revenue: number }>;
}

interface ExtendedAnalytics {
  cartAbandonment: { cartsCreated: number; ordersPlaced: number; abandonedCarts: number; rate: number };
  revenueByCategory: Array<{ category: string; revenue: number }>;
  returnRate: { totalOrders: number; returned: number; cancelled: number; rate: number };
  averageFulfillmentDays: number;
  paymentMethodSplit: Array<{ provider: string; count: number; amount: number }>;
  revenueByCity: Array<{ city: string; revenue: number }>;
}

const RANGES = [7, 30, 90] as const;

export default function AdminReportsPage() {
  const [days, setDays] = useState<number>(30);
  const [stitching, setStitching] = useState<StitchingAnalytics | null>(null);
  const [extended, setExtended] = useState<ExtendedAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      adminFetch<StitchingAnalytics>('/admin/analytics/stitching', { query: { days } }),
      adminFetch<ExtendedAnalytics>('/admin/analytics/extended', { query: { days } }),
    ])
      .then(([stitchingData, extendedData]) => {
        if (cancelled) return;
        setStitching(stitchingData);
        setExtended(extendedData);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load the reports');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [days]);

  // The API fetches with a bearer token rather than a cookie, so a plain
  // <a href> to the export route can't carry auth — the CSV is fetched as
  // text and handed to the browser as an object-URL download instead, same
  // as the catalogue import page's template download.
  async function downloadCsv(
    name: string,
    path: string,
    query: Record<string, unknown> | undefined,
    filename: string,
  ) {
    setExportError(null);
    setExporting(name);
    try {
      const csv = await adminFetch<string>(path, { query, expect: 'text' });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : `Could not export ${filename}`);
    } finally {
      setExporting(null);
    }
  }

  if (error) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!stitching || !extended) {
    return <p className="text-sm text-ink/50">Loading…</p>;
  }

  const { cartAbandonment, returnRate } = extended;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Reports</h1>
          <p className="mt-1 text-sm text-ink/60">
            Everything the dashboard leaves out — stitching demand, funnel health and exports.
          </p>
        </div>

        <div className="flex gap-1" role="group" aria-label="Date range">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              aria-pressed={days === option}
              className={clsx(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                days === option ? 'bg-brand-600 text-white' : 'text-ink/70 hover:bg-sand-100',
              )}
            >
              {option} days
            </button>
          ))}
        </div>
      </div>

      {/* Stitching & garments */}
      <section className="mt-2">
        <h2 className="text-sm font-semibold text-ink">
          Stitching & garments <span className="font-normal text-ink/50">· last {days} days</span>
        </h2>

        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-ink">Top garments by jobs</h3>
            {stitching.topGarments.length === 0 ? (
              <p className="mt-4 text-sm text-ink/50">No stitching jobs in this window.</p>
            ) : (
              <BarList
                items={stitching.topGarments.map((row) => ({
                  key: row.key,
                  label: row.label,
                  value: row.jobs,
                  sub: formatMoney(row.revenue),
                }))}
                valueFormatter={(value) => `${value} ${value === 1 ? 'job' : 'jobs'}`}
              />
            )}
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-ink">Top design options picked</h3>
            {stitching.topOptions.length === 0 ? (
              <p className="mt-4 text-sm text-ink/50">No style options booked in this window.</p>
            ) : (
              <BarList
                items={stitching.topOptions.map((row, index) => ({
                  key: `${row.groupKey}-${index}`,
                  label: row.label,
                  value: row.count,
                  sub: formatMoney(row.revenue),
                }))}
                valueFormatter={(value) => `${value}×`}
              />
            )}
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-ink">Revenue by garment</h3>
            {stitching.revenueByGarment.length === 0 ? (
              <p className="mt-4 text-sm text-ink/50">No stitching revenue in this window.</p>
            ) : (
              <BarList
                items={stitching.revenueByGarment.map((row, index) => ({
                  key: `${row.label}-${index}`,
                  label: row.label,
                  value: row.revenue,
                }))}
                valueFormatter={formatMoney}
              />
            )}
          </div>
        </div>
      </section>

      {/* Store health */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink">
          Store health <span className="font-normal text-ink/50">· last {days} days</span>
        </h2>

        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Cart abandonment"
            value={`${cartAbandonment.rate}%`}
            hint={`${cartAbandonment.ordersPlaced} of ${cartAbandonment.cartsCreated} carts became orders`}
          />
          <Stat
            label="Returns & cancellations"
            value={`${returnRate.rate}%`}
            hint={`${returnRate.returned + returnRate.cancelled} of ${returnRate.totalOrders} orders`}
          />
          <Stat
            label="Average fulfilment"
            value={`${extended.averageFulfillmentDays} days`}
            hint="Placed to delivered"
          />
        </div>
      </section>

      {/* Revenue breakdown */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink">
          Revenue breakdown <span className="font-normal text-ink/50">· last {days} days</span>
        </h2>

        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-ink">By category</h3>
            {extended.revenueByCategory.length === 0 ? (
              <p className="mt-4 text-sm text-ink/50">No sales in this window.</p>
            ) : (
              <BarList
                items={extended.revenueByCategory.map((row) => ({
                  key: row.category,
                  label: row.category,
                  value: row.revenue,
                }))}
                valueFormatter={formatMoney}
              />
            )}
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-ink">By city</h3>
            {extended.revenueByCity.length === 0 ? (
              <p className="mt-4 text-sm text-ink/50">No sales in this window.</p>
            ) : (
              <BarList
                items={extended.revenueByCity.map((row) => ({
                  key: row.city,
                  label: row.city,
                  value: row.revenue,
                }))}
                valueFormatter={formatMoney}
              />
            )}
          </div>

          <div className="card">
            <div className="border-b border-sand-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Payment method split</h3>
            </div>
            {extended.paymentMethodSplit.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink/50">No payments recorded in this window.</p>
            ) : (
              <div className="max-h-64 overflow-auto px-4 pb-4">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th
                        scope="col"
                        className="py-1 text-start text-xs font-semibold uppercase tracking-wide text-ink/50"
                      >
                        Provider
                      </th>
                      <th
                        scope="col"
                        className="py-1 text-end text-xs font-semibold uppercase tracking-wide text-ink/50"
                      >
                        Count
                      </th>
                      <th
                        scope="col"
                        className="py-1 text-end text-xs font-semibold uppercase tracking-wide text-ink/50"
                      >
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-100">
                    {extended.paymentMethodSplit.map((row) => (
                      <tr key={row.provider}>
                        <td className="py-1 text-ink/70">{row.provider}</td>
                        <td className="py-1 text-end tabular-nums text-ink/70">{row.count}</td>
                        <td className="py-1 text-end tabular-nums text-ink">{formatMoney(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Export */}
      <section className="mt-6 card p-4">
        <h2 className="text-sm font-semibold text-ink">Export</h2>
        <p className="mt-1 text-xs text-ink/50">
          Orders and sales cover the last {days} days; stock is always current.
        </p>

        {exportError ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {exportError}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() =>
              void downloadCsv(
                'orders',
                '/admin/reports/export/orders',
                { from: isoDateDaysAgo(days), to: isoToday() },
                'yaseen-orders.csv',
              )
            }
            className="btn-secondary"
          >
            {exporting === 'orders' ? 'Exporting…' : 'Export orders CSV'}
          </button>

          <button
            type="button"
            disabled={exporting !== null}
            onClick={() =>
              void downloadCsv(
                'sales',
                '/admin/reports/export/sales-by-day',
                { from: isoDateDaysAgo(days), to: isoToday() },
                'yaseen-sales-by-day.csv',
              )
            }
            className="btn-secondary"
          >
            {exporting === 'sales' ? 'Exporting…' : 'Export sales CSV'}
          </button>

          <button
            type="button"
            disabled={exporting !== null}
            onClick={() =>
              void downloadCsv('stock', '/admin/reports/export/stock', undefined, 'yaseen-stock.csv')
            }
            className="btn-secondary"
          >
            {exporting === 'stock' ? 'Exporting…' : 'Export stock CSV'}
          </button>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-ink/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink/40">{hint}</p> : null}
    </div>
  );
}

/** Ranked list with a proportional bar, matching the dashboard's best-sellers pattern. */
function BarList({
  items,
  valueFormatter,
}: {
  items: Array<{ key: string; label: string; value: number; sub?: string }>;
  valueFormatter: (value: number) => string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink">{item.label}</span>
            <span className="shrink-0 text-ink/70">{valueFormatter(item.value)}</span>
          </div>
          {/* Sequential single hue: more of the metric is a longer bar. */}
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-sand-100">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max((item.value / max) * 100, 2)}%`, backgroundColor: '#0f8fa3' }}
            />
          </div>
          {item.sub ? <p className="mt-0.5 text-xs text-ink/40">{item.sub}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** ISO calendar date `days` ago, matching AnalyticsService.windowStart's convention. */
function isoDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
