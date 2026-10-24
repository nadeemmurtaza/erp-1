'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { downloadCsv } from '@/lib/download-csv';
import { DataTable, Loading, MetricStrip, PageHeader, ProgressBar, SectionRail, TruncateReveal } from '@/components/ui';
import { RangePicker, type RangeDays } from '@/components/admin/range-picker';
import { paymentProviderLabel } from '@/constants/payment-methods';
import { exportFilename } from '@/constants/downloads';
import type { PermissionKey } from '@/constants/permissions';
import { useAdminSession } from '@/components/admin/session';

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

/**
 * Every CSV this page can produce.
 *
 * These were eight near-identical twenty-line buttons, which is why three of
 * them said "Exporting..." with an ASCII ellipsis while the others said
 * "Exporting…" with a real one, and why the permission check on stock
 * valuation was easy to miss in the middle of them. A row of buttons is a
 * list; lists are data.
 *
 * `ranged` marks the exports that cover the selected window. Stock and slow
 * movers are a snapshot of right now and take no dates — a distinction the
 * old markup buried in whether `undefined` was passed as the third argument.
 */
const EXPORTS: Array<{
  key: string;
  label: string;
  path: string;
  ranged: boolean;
  permission?: PermissionKey;
}> = [
  { key: 'orders', label: 'Orders', path: '/admin/reports/export/orders', ranged: true },
  { key: 'sales', label: 'Sales by day', path: '/admin/reports/export/sales-by-day', ranged: true },
  {
    key: 'stitching-bookings',
    label: 'Stitching bookings',
    path: '/admin/reports/export/stitching-bookings',
    ranged: true,
  },
  {
    key: 'purchases-by-supplier',
    label: 'Purchases by supplier',
    path: '/admin/reports/export/purchases-by-supplier',
    ranged: true,
  },
  { key: 'stock-ledger', label: 'Stock ledger', path: '/admin/reports/export/stock-ledger', ranged: true },
  { key: 'stock', label: 'Stock', path: '/admin/reports/export/stock', ranged: false },
  { key: 'slow-movers', label: 'Slow movers', path: '/admin/reports/export/slow-movers', ranged: false },
  {
    key: 'stock-valuation',
    label: 'Stock valuation',
    path: '/admin/reports/export/stock-valuation',
    ranged: false,
    permission: 'inventory.view_cost',
  },
];

export default function AdminReportsPage() {
  const { can } = useAdminSession();
  const [days, setDays] = useState<RangeDays>(30);
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

  async function runExport(
    name: string,
    path: string,
    query: Record<string, unknown> | undefined,
    filename: string,
  ) {
    setExportError(null);
    setExporting(name);
    try {
      await downloadCsv(path, filename, query);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : `Could not export ${filename}`);
    } finally {
      setExporting(null);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="Reports" />
        <p role="alert" className="text-sm text-feedback-negative">
          {error}
        </p>
      </>
    );
  }

  if (!stitching || !extended) {
    return (
      <>
        <PageHeader title="Reports" />
        <Loading />
      </>
    );
  }

  const { cartAbandonment, returnRate } = extended;
  const exports = EXPORTS.filter((row) => !row.permission || can(row.permission));

  return (
    <>
      <PageHeader
        title="Reports"
        description="Everything the dashboard leaves out — stitching demand, funnel health and exports."
        action={<RangePicker value={days} onChange={setDays} />}
      />

      {/*
       * Store health leads as the strip, because these three numbers are the
       * ones that say whether anything below is worth opening. Everything else
       * is the detail behind them, and waits to be chosen.
       */}
      <MetricStrip
        label="Store health"
        lead="abandonment"
        className="mb-10"
        items={[
          {
            key: 'abandonment',
            label: 'Cart abandonment',
            value: `${cartAbandonment.rate}%`,
            delta: {
              label: `${cartAbandonment.ordersPlaced} of ${cartAbandonment.cartsCreated} carts became orders`,
              direction: 'flat',
            },
          },
          {
            key: 'returns',
            label: 'Returns & cancellations',
            value: `${returnRate.rate}%`,
            delta: {
              label: `${returnRate.returned + returnRate.cancelled} of ${returnRate.totalOrders} orders`,
              direction: 'flat',
            },
          },
          {
            key: 'fulfilment',
            label: 'Average fulfilment',
            value: `${extended.averageFulfillmentDays} days`,
            delta: { label: 'Placed to delivered', direction: 'flat' },
          },
        ]}
      />

      <SectionRail
        label="Report sections"
        sections={[
          {
            id: 'stitching',
            label: 'Stitching & garments',
            content: (
              <div className="grid gap-8 fold:grid-cols-2 lg:grid-cols-3">
                <Panel title="Top garments by jobs" empty={stitching.topGarments.length === 0}>
                  <BarList
                    items={stitching.topGarments.map((row) => ({
                      key: row.key,
                      label: row.label,
                      value: row.jobs,
                      sub: formatMoney(row.revenue),
                    }))}
                    valueFormatter={(value) => `${value} ${value === 1 ? 'job' : 'jobs'}`}
                  />
                </Panel>

                <Panel title="Top design options picked" empty={stitching.topOptions.length === 0}>
                  <BarList
                    items={stitching.topOptions.map((row, index) => ({
                      key: `${row.groupKey}-${index}`,
                      label: row.label,
                      value: row.count,
                      sub: formatMoney(row.revenue),
                    }))}
                    valueFormatter={(value) => `${value}×`}
                  />
                </Panel>

                <Panel title="Revenue by garment" empty={stitching.revenueByGarment.length === 0}>
                  <BarList
                    items={stitching.revenueByGarment.map((row, index) => ({
                      key: `${row.label}-${index}`,
                      label: row.label,
                      value: row.revenue,
                    }))}
                    valueFormatter={formatMoney}
                  />
                </Panel>
              </div>
            ),
          },
          {
            id: 'revenue',
            label: 'Revenue breakdown',
            content: (
              <div className="grid gap-8 fold:grid-cols-2 lg:grid-cols-3">
                <Panel title="By category" empty={extended.revenueByCategory.length === 0}>
                  <BarList
                    items={extended.revenueByCategory.map((row) => ({
                      key: row.category,
                      label: row.category,
                      value: row.revenue,
                    }))}
                    valueFormatter={formatMoney}
                  />
                </Panel>

                <Panel title="By city" empty={extended.revenueByCity.length === 0}>
                  <BarList
                    items={extended.revenueByCity.map((row) => ({
                      key: row.city,
                      label: row.city,
                      value: row.revenue,
                    }))}
                    valueFormatter={formatMoney}
                  />
                </Panel>

                <Panel
                  title="Payment method split"
                  empty={extended.paymentMethodSplit.length === 0}
                  emptyLabel="No payments recorded in this window."
                >
                  <div className="max-h-64 overflow-auto">
                    <DataTable
                      rows={extended.paymentMethodSplit}
                      rowKey={(row) => paymentProviderLabel(row.provider)}
                      columns={[
                        {
                          header: 'Provider',
                          cell: (row) => paymentProviderLabel(row.provider),
                          muted: true,
                        },
                        {
                          header: 'Count',
                          align: 'end',
                          numeric: true,
                          muted: true,
                          cell: (row) => row.count,
                        },
                        {
                          header: 'Amount',
                          align: 'end',
                          numeric: true,
                          cell: (row) => formatMoney(row.amount),
                        },
                      ]}
                    />
                  </div>
                </Panel>
              </div>
            ),
          },
          {
            id: 'export',
            label: 'Export',
            badge: exports.length,
            content: (
              <>
                <p className="mb-4 max-w-prose text-sm text-neutral-900/60">
                  Dated exports cover the last {days} days. Stock, slow movers and valuation are a
                  snapshot of right now.
                </p>

                {exportError ? (
                  <p role="alert" className="mb-4 text-sm text-feedback-negative">
                    {exportError}
                  </p>
                ) : null}

                <ul className="max-w-xl divide-y divide-neutral-100 border-y border-neutral-100">
                  {exports.map((row) => (
                    <li key={row.key} className="flex items-center justify-between gap-4 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-neutral-900">{row.label}</span>
                        <span className="block text-xs text-neutral-900/60">
                          {row.ranged ? `Last ${days} days` : 'Current snapshot'}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={exporting !== null}
                        onClick={() =>
                          void runExport(
                            row.key,
                            row.path,
                            row.ranged ? { from: isoDateDaysAgo(days), to: isoToday() } : undefined,
                            exportFilename(row.key),
                          )
                        }
                        className="btn-text shrink-0"
                      >
                        {exporting === row.key ? 'Exporting…' : 'Download CSV'}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ),
          },
        ]}
      />
    </>
  );
}

/**
 * One figure's worth of a report, with no box around it.
 *
 * These were `card p-4` — nine of them on this page, which is how a reports
 * screen ends up looking like a filing cabinet. A heading and its content
 * grouped by space says the same thing more quietly.
 */
function Panel({
  title,
  empty,
  emptyLabel = 'Nothing in this window.',
  children,
}: {
  title: string;
  empty: boolean;
  emptyLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h3 className="eyebrow mb-3">{title}</h3>
      {empty ? <p className="text-sm text-neutral-900/60">{emptyLabel}</p> : children}
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
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 text-neutral-900">
              <TruncateReveal text={item.label} />
            </span>
            <span className="shrink-0 tabular-nums text-neutral-900/70">
              {valueFormatter(item.value)}
            </span>
          </div>
          {/* Sequential single hue: more of the metric is a longer bar. A floor of 2% keeps the smallest value visible; the label carries the true figure. */}
          <ProgressBar
            className="mt-1"
            label={item.label}
            value={Math.max(item.value, max * 0.02)}
            max={max}
            valueText={valueFormatter(item.value)}
          />
          {item.sub ? <p className="mt-0.5 text-xs text-neutral-900/60">{item.sub}</p> : null}
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
