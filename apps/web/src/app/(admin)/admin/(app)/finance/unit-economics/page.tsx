'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney, formatDate } from '@newax/shared';
import { DataTable, MetricStrip, Pagination, type MetricItem, type PaginationMeta } from '@/components/ui';

interface UnitEconomicsRow {
  orderId: string;
  orderNumber: string;
  placedAt: string;
  status: string;
  revenue: number;
  cogs: number;
  contribution: number;
}

interface UnitEconomicsResult {
  data: UnitEconomicsRow[];
  meta: PaginationMeta;
  averages: { contribution: number; revenue: number; orderCount: number };
}

/**
 * WO-4.2's own unit economics (04-finance.md) — "this Rs 3,499 kurta earns
 * Rs 1,180 after courier, gateway and packaging." Contribution per order,
 * from OrderEconomics (WO-4.2), the per-order granularity the general
 * ledger's aggregate posting doesn't carry.
 */
export default function FinanceUnitEconomicsPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<UnitEconomicsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<UnitEconomicsResult>(`/admin/finance/unit-economics?page=${page}&pageSize=25`)
      .then(setResult)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load unit economics'));
  }, [page]);

  const metrics: MetricItem[] = result
    ? [
        { key: 'orders', label: 'Delivered orders (90d)', value: result.averages.orderCount },
        { key: 'avg-revenue', label: 'Average revenue', value: formatMoney(result.averages.revenue) },
        { key: 'avg-contribution', label: 'Average contribution', value: formatMoney(result.averages.contribution) },
      ]
    : [];

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Unit economics</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Contribution per order — what each sale actually earns after courier, gateway and packaging.
      </p>

      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}

      {result ? (
        <MetricStrip label="Unit economics summary" items={metrics} className="mb-6" />
      ) : (
        <div className="skeleton mb-6 h-16 rounded-md" />
      )}

      <div className="overflow-hidden">
        <DataTable
          rows={result?.data ?? null}
          loading={result === null}
          rowKey={(row) => row.orderId}
          emptyLabel="No delivered orders in the last 90 days."
          columns={[
            {
              header: 'Order',
              cell: (row) => (
                <Link href={`/admin/orders/${row.orderId}`} className="font-medium text-accent-hover hover:underline">
                  {row.orderNumber}
                </Link>
              ),
            },
            { header: 'Placed', muted: true, cell: (row) => formatDate(row.placedAt) },
            { header: 'Status', muted: true, cell: (row) => row.status },
            { header: 'Revenue', align: 'end', numeric: true, cell: (row) => formatMoney(row.revenue) },
            { header: 'COGS', align: 'end', numeric: true, muted: true, cell: (row) => formatMoney(row.cogs) },
            {
              header: 'Contribution',
              align: 'end',
              numeric: true,
              cell: (row) => (
                <span className={row.contribution < 0 ? 'text-red-700' : 'font-medium'}>{formatMoney(row.contribution)}</span>
              ),
            },
          ]}
        />
      </div>

      {result ? <Pagination meta={result.meta} onChange={setPage} itemLabel="orders" /> : null}
    </>
  );
}
