'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, EmptyState, MetricStrip, PageHeader } from '@/components/ui';
import { DonutChart } from '@/components/admin/donut-chart';
import { RangePicker, type RangeDays } from '@/components/admin/range-picker';

interface ByCategoryRow {
  categoryId: string;
  key: string;
  name: string;
  isDirect: boolean;
  amount: number;
  shareBps: number;
  count: number;
  changeBps: number | null;
}

interface ByCategoryResult {
  total: number;
  vsRevenueBps: number;
  rows: ByCategoryRow[];
}

interface TrendPoint {
  t: string;
  total: number;
  direct: number;
  operating: number;
}

interface TrendResult {
  series: TrendPoint[];
  bucket: 'day' | 'month';
}

function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

function signedPercent(bps: number): string {
  return `${bps >= 0 ? '+' : ''}${bpsToPercent(bps)}`;
}

/**
 * WO-23.1's WO-B.4 — expense-by-category, expense trend, and how spend
 * compares to revenue. This repo has no dashboard-card or report-registry
 * for a screen like this to plug into (ADR-019 records why: Track A of
 * 10-admin-dashboard.md, which would have built one, was never built) — so,
 * same as /admin/reports and /admin/insights already do, this is a plain
 * page calling the plain finance endpoints directly.
 */
export default function ExpenseAnalyticsPage() {
  const [days, setDays] = useState<RangeDays>(30);
  const [byCategory, setByCategory] = useState<ByCategoryResult | null>(null);
  const [trend, setTrend] = useState<TrendResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [byCategoryRes, trendRes] = await Promise.all([
        adminFetch<ByCategoryResult>('/admin/finance/expenses/by-category', { query: { from, to } }),
        adminFetch<TrendResult>('/admin/finance/expenses/trend', { query: { from, to } }),
      ]);
      setByCategory(byCategoryRes);
      setTrend(trendRes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load expense analytics');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- from/to are derived from `days`, already a dependency
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasData = (byCategory?.rows.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Expense analytics"
        description="Where the shop's spend goes, and how it compares to revenue."
        action={
          <Link href="/admin/finance/expenses" className="btn-secondary">
            Ledger
          </Link>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="mb-6">
        <RangePicker value={days} onChange={setDays} />
      </div>

      {byCategory ? (
        <div className="mb-6">
          <MetricStrip
            label="This window"
            items={[
              { key: 'total', label: 'Total expenses', value: formatMoney(byCategory.total) },
              { key: 'vsRevenue', label: 'Vs. revenue', value: bpsToPercent(byCategory.vsRevenueBps) },
            ]}
          />
        </div>
      ) : null}

      {!busy && !hasData ? (
        <EmptyState
          title="No expenses in this window"
          description="Nothing was recorded in the selected range. Widen the range, or record one."
          action={
            <Link href="/admin/finance/expenses" className="btn-primary">
              Record an expense
            </Link>
          }
        />
      ) : (
        <>
          <section className="card mb-6 p-4">
            <h2 className="mb-4 text-sm font-medium text-neutral-900">By category</h2>
            <DonutChart
              items={(byCategory?.rows ?? []).map((row) => ({ label: row.name, value: row.amount }))}
              valueFormatter={formatMoney}
            />
          </section>

          <div className="mb-6 overflow-hidden">
            <DataTable
              rows={byCategory?.rows ?? null}
              loading={busy && !byCategory}
              rowKey={(row) => row.categoryId}
              emptyLabel="No categories in this window."
              columns={[
                {
                  header: 'Category',
                  cell: (row) => (
                    <Link
                      href={`/admin/finance/expenses?categoryId=${row.categoryId}&from=${from}&to=${to}`}
                      className="text-accent-hover hover:underline"
                    >
                      {row.name}
                    </Link>
                  ),
                },
                { header: 'Amount', numeric: true, align: 'end', cell: (row) => formatMoney(row.amount) },
                { header: 'Share', numeric: true, align: 'end', muted: true, cell: (row) => bpsToPercent(row.shareBps) },
                {
                  header: 'Change',
                  numeric: true,
                  align: 'end',
                  muted: true,
                  cell: (row) => (row.changeBps === null ? 'New' : signedPercent(row.changeBps)),
                },
                { header: 'Count', numeric: true, align: 'end', muted: true, cell: (row) => row.count },
              ]}
            />
          </div>

          <div className="overflow-hidden">
            <DataTable
              rows={trend?.series ?? null}
              loading={busy && !trend}
              rowKey={(point) => point.t}
              emptyLabel="No expenses in this window."
              columns={[
                { header: trend?.bucket === 'month' ? 'Month' : 'Date', cell: (point) => point.t },
                { header: 'Total', numeric: true, align: 'end', cell: (point) => formatMoney(point.total) },
                { header: 'Direct', numeric: true, align: 'end', muted: true, cell: (point) => formatMoney(point.direct) },
                {
                  header: 'Operating',
                  numeric: true,
                  align: 'end',
                  muted: true,
                  cell: (point) => formatMoney(point.operating),
                },
              ]}
            />
          </div>
        </>
      )}
    </>
  );
}
