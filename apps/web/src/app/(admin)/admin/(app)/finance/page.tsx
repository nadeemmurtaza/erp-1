'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { downloadCsv } from '@/lib/download-csv';
import { formatMoney } from '@newax/shared';
import { CountUp, DataTable, MetricStrip, type MetricItem } from '@/components/ui';
import { GaugeChart } from '@/components/admin/gauge-chart';

/**
 * How the P&L figures count up. Whole minor units at every frame, so no frame
 * ever shows a fraction of a paisa; the percentage settles on one decimal, the
 * same text it showed before it moved.
 */
const money = (minor: number) => formatMoney(Math.round(minor));
const percent = (n: number) => `${Math.round(n * 10) / 10}%`;

interface GlAccountLine {
  accountId: string;
  code: string;
  name: string;
  amountMinor: number;
}

interface ProfitAndLoss {
  from: string;
  to: string;
  income: GlAccountLine[];
  expense: GlAccountLine[];
  totalIncomeMinor: number;
  totalExpenseMinor: number;
  netIncomeMinor: number;
}

/** The first and last instant of the given "YYYY-MM" month, as ISO date strings. */
function monthBounds(monthKey: string): { from: string; to: string } {
  const [year, month] = monthKey.split('-').map(Number);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * WO-4.3's P&L (04-finance.md) — a UI over the general ledger's own
 * `profitAndLoss()` (RETAIL-ERP.md R15), not a second computation of
 * profit. See docs/implementation/04-finance.md's own status note for why:
 * summing Expense/OrderEconomics rows here would produce a number that can
 * silently disagree with the ledger.
 */
export default function FinancePnlPage() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [current, setCurrent] = useState<ProfitAndLoss | null>(null);
  const [trend, setTrend] = useState<Array<{ monthKey: string; netIncomeMinor: number }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { from, to } = monthBounds(monthKey);
    setCurrent(null);
    adminFetch<ProfitAndLoss>(`/admin/accounting/reports/profit-and-loss?from=${from}&to=${to}`)
      .then(setCurrent)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the P&L'));
  }, [monthKey]);

  useEffect(() => {
    const months = Array.from({ length: 6 }, (_, i) => shiftMonthKey(monthKey, i - 5));
    Promise.all(
      months.map(async (key) => {
        const { from, to } = monthBounds(key);
        const result = await adminFetch<ProfitAndLoss>(`/admin/accounting/reports/profit-and-loss?from=${from}&to=${to}`);
        return { monthKey: key, netIncomeMinor: result.netIncomeMinor };
      }),
    )
      .then(setTrend)
      .catch(() => setTrend(null));
  }, [monthKey]);

  const netMarginPercent = useMemo(() => {
    if (!current || current.totalIncomeMinor === 0) return 0;
    return Math.round((current.netIncomeMinor / current.totalIncomeMinor) * 1000) / 10;
  }, [current]);

  const metrics: MetricItem[] = current
    ? [
        {
          key: 'income',
          label: 'Total revenue',
          value: <CountUp value={current.totalIncomeMinor} format={money} />,
          detail: (
            <AccountBreakdown rows={current.income} />
          ),
        },
        {
          key: 'expense',
          label: 'Total expense',
          value: <CountUp value={current.totalExpenseMinor} format={money} />,
          detail: (
            <AccountBreakdown rows={current.expense} />
          ),
        },
        {
          key: 'net',
          label: 'Net profit',
          // The one figure the page is about: its digits roll to their places rather than the whole figure counting.
          value: <CountUp mode="reel" value={current.netIncomeMinor} format={money} />,
        },
        {
          key: 'margin',
          label: 'Net margin',
          value: <CountUp value={netMarginPercent} format={percent} />,
        },
      ]
    : [];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">Profit & loss</h1>
          <p className="text-sm text-neutral-900/60">
            Every figure is a query over the general ledger — click one to see the accounts behind it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="pnl-month">Month</label>
          <input
            id="pnl-month"
            type="month"
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value)}
            className="field-input py-1.5"
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const { from, to } = monthBounds(monthKey);
              void downloadCsv('/admin/reports/export/profit-and-loss', `profit-and-loss_${monthKey}.csv`, { from, to });
            }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}

      {current ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_14rem]">
          <MetricStrip label="Profit and loss summary" items={metrics} />
          <div className="card flex flex-col items-center justify-center p-4">
            <GaugeChart percent={Math.max(0, Math.min(100, netMarginPercent))} caption="Net margin" />
          </div>
        </div>
      ) : (
        <div className="skeleton h-24 rounded-md" />
      )}

      {trend ? (
        <div className="card mt-6 p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Net profit, last 6 months</h2>
          <TrendBars points={trend} />
        </div>
      ) : null}
    </>
  );
}

function AccountBreakdown({ rows }: { rows: GlAccountLine[] }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.accountId}
      emptyLabel="No postings in this range."
      columns={[
        { header: 'Code', muted: true, cell: (row) => row.code },
        { header: 'Account', cell: (row) => row.name },
        { header: 'Amount', align: 'end', numeric: true, cell: (row) => formatMoney(row.amountMinor) },
      ]}
    />
  );
}

function TrendBars({ points }: { points: Array<{ monthKey: string; netIncomeMinor: number }> }) {
  const max = Math.max(1, ...points.map((p) => Math.abs(p.netIncomeMinor)));
  return (
    <div className="flex items-end gap-3" role="img" aria-label="Net profit trend over the last six months">
      {points.map((point) => {
        const heightPercent = (Math.abs(point.netIncomeMinor) / max) * 100;
        const isLoss = point.netIncomeMinor < 0;
        return (
          <div key={point.monthKey} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs tabular-nums text-neutral-900/70">{formatMoney(point.netIncomeMinor)}</span>
            <div className="flex h-24 w-full items-end">
              <div
                className={isLoss ? 'w-full rounded-t bg-red-400' : 'w-full rounded-t bg-accent'}
                style={{ height: `${Math.max(4, heightPercent)}%` }}
              />
            </div>
            <span className="text-xs text-neutral-900/60">{point.monthKey}</span>
          </div>
        );
      })}
    </div>
  );
}
