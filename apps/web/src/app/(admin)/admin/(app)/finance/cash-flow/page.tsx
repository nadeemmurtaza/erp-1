'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { downloadCsv } from '@/lib/download-csv';
import { formatMoney, formatDate } from '@newax/shared';
import { DataTable, MetricStrip, type MetricItem } from '@/components/ui';
import { DateField } from '@/components/ui/date-field';

interface CashFlowAccount {
  code: string;
  name: string;
  netChangeMinor: number;
}

interface CashFlowResult {
  from: string;
  to: string;
  accounts: CashFlowAccount[];
  netChangeMinor: number;
}

interface AgedRow {
  id: string;
  name: string;
  buckets: { current: number; days31to60: number; days61to90: number; over90: number };
  totalMinor: number;
}

interface AgedResult {
  asOf: string;
  rows: AgedRow[];
  totalMinor: number;
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * WO-4.4's cash flow + payables ageing (04-finance.md) — a UI over the
 * general ledger's own `cashFlow()`/`agedPayables()` (RETAIL-ERP.md R15),
 * the direct-method movement on every bank/cash account plus FIFO-aged
 * outstanding supplier balances. No bank reconciliation — there is no bank
 * feed, and the doc's own instruction is not to invent one.
 */
export default function FinanceCashFlowPage() {
  const [range, setRange] = useState(defaultRange());
  const [cashFlow, setCashFlow] = useState<CashFlowResult | null>(null);
  const [payables, setPayables] = useState<AgedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCashFlow(null);
    adminFetch<CashFlowResult>(`/admin/accounting/reports/cash-flow?from=${range.from}&to=${range.to}`)
      .then(setCashFlow)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load cash flow'));
  }, [range]);

  useEffect(() => {
    adminFetch<AgedResult>(`/admin/accounting/reports/aged-payables?asOf=${range.to}`)
      .then(setPayables)
      .catch(() => setPayables({ asOf: range.to, rows: [], totalMinor: 0 }));
  }, [range.to]);

  const metrics: MetricItem[] = cashFlow
    ? [
        {
          key: 'net',
          label: 'Net cash movement',
          value: formatMoney(cashFlow.netChangeMinor),
        },
        ...cashFlow.accounts.map((account) => ({
          key: account.code,
          label: account.name,
          value: formatMoney(account.netChangeMinor),
        })),
      ]
    : [];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">Cash flow</h1>
          <p className="text-sm text-neutral-900/60">
            Money in and out of every bank/cash account, plus who is owed and for how long.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateField
            value={range.from}
            onChange={(next) => setRange((current) => ({ ...current, from: next }))}
            aria-label="From date"
          />
          <DateField
            value={range.to}
            onChange={(next) => setRange((current) => ({ ...current, to: next }))}
            aria-label="To date"
          />
        </div>
      </div>

      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}

      {cashFlow ? (
        <MetricStrip label="Cash movement by account" items={metrics} className="mb-8" />
      ) : (
        <div className="skeleton mb-8 h-16 rounded-md" />
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Payables ageing, as of {formatDate(range.to)}</h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void downloadCsv('/admin/reports/export/payables', `payables_${range.to}.csv`, { asOf: range.to })}
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-hidden">
        <DataTable
          rows={payables?.rows ?? null}
          loading={payables === null}
          rowKey={(row) => row.id}
          emptyLabel="Nothing outstanding to any supplier as of this date."
          columns={[
            { header: 'Supplier', cell: (row) => row.name, className: 'font-medium' },
            { header: 'Current', align: 'end', numeric: true, muted: true, cell: (row) => formatMoney(row.buckets.current) },
            { header: '31-60 days', align: 'end', numeric: true, muted: true, cell: (row) => formatMoney(row.buckets.days31to60) },
            { header: '61-90 days', align: 'end', numeric: true, muted: true, cell: (row) => formatMoney(row.buckets.days61to90) },
            {
              header: '91+ days',
              align: 'end',
              numeric: true,
              cell: (row) => (
                <span className={row.buckets.over90 > 0 ? 'font-medium text-red-700' : 'text-neutral-900/60'}>
                  {formatMoney(row.buckets.over90)}
                </span>
              ),
            },
            { header: 'Total', align: 'end', numeric: true, cell: (row) => formatMoney(row.totalMinor), className: 'font-medium' },
          ]}
        />
      </div>
    </>
  );
}
