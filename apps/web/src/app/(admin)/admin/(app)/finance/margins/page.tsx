'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney } from '@newax/shared';
import { DataTable, Tabs } from '@/components/ui';

type GroupBy = 'product' | 'category' | 'variant';

interface MarginRow {
  key: string;
  label: string;
  revenue: number;
  cogs: number;
  quantity: number;
  marginAmount: number;
  marginPercent: number;
}

/**
 * WO-4.3's "bottom and top products by margin" (04-finance.md) — sourced
 * from OrderItem/OrderEconomics, not the general ledger (see
 * FinanceService.marginBy's own comment on why: the GL posts one line per
 * order, not per product).
 */
export default function FinanceMarginsPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Margins</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Worst first — the list that changes decisions. Trailing 12 months of delivered orders.
      </p>

      <Tabs
        label="Group margins by"
        items={[
          { key: 'product', label: 'By product', content: <MarginTable groupBy="product" /> },
          { key: 'category', label: 'By category', content: <MarginTable groupBy="category" /> },
          { key: 'variant', label: 'By variant', content: <MarginTable groupBy="variant" /> },
        ]}
      />
    </>
  );
}

function MarginTable({ groupBy }: { groupBy: GroupBy }) {
  const [rows, setRows] = useState<MarginRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ groupBy: GroupBy; rows: MarginRow[] }>(`/admin/finance/margins?groupBy=${groupBy}`)
      .then((result) => setRows(result.rows))
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : 'Could not load margins');
        setRows([]);
      });
  }, [groupBy]);

  return (
    <div className="pt-4">
      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}
      <div className="overflow-hidden">
        <DataTable
          rows={rows}
          loading={rows === null}
          rowKey={(row) => row.key}
          emptyLabel="No delivered orders with revenue in this window yet."
          columns={[
            {
              header: groupBy === 'product' ? 'Product' : groupBy === 'category' ? 'Category' : 'Variant',
              cell: (row) =>
                groupBy === 'product' ? (
                  <Link href={`/admin/products/${row.key}`} className="font-medium text-accent-hover hover:underline">
                    {row.label}
                  </Link>
                ) : (
                  <span className="font-medium text-neutral-900">{row.label}</span>
                ),
            },
            { header: 'Units sold', align: 'end', numeric: true, muted: true, cell: (row) => row.quantity },
            { header: 'Revenue', align: 'end', numeric: true, cell: (row) => formatMoney(row.revenue) },
            { header: 'COGS', align: 'end', numeric: true, muted: true, cell: (row) => formatMoney(row.cogs) },
            {
              header: 'Margin',
              align: 'end',
              numeric: true,
              cell: (row) => (
                <span className={row.marginAmount < 0 ? 'text-red-700' : ''}>
                  {formatMoney(row.marginAmount)} ({row.marginPercent}%)
                </span>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
