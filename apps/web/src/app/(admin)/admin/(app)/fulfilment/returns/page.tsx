'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime, formatMoney } from '@newax/shared';
import { DataTable, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface ReturnRow {
  id: string;
  number: string;
  status: string;
  requestedAt: string;
  order: { id: string; number: string };
  items: Array<{ quantity: number }>;
  refundAmount: number | null;
}

/** WO-6.8's `/admin/sales/returns` — folded into the "orders" nav group (the doc's own "Sales" group no longer exists as a heading; see nav-registry.ts). */
export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<ReturnRow[]>('/admin/fulfilment/returns')
      .then(setReturns)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load returns'));
  }, []);

  return (
    <>
      <PageHeader title="Returns" description="Request → approve → receive → inspect → resolve." />

      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}

      <div className="overflow-hidden">
        <DataTable
          rows={returns}
          loading={returns === null}
          rowKey={(row) => row.id}
          emptyLabel="No return requests yet."
          columns={[
            {
              header: 'Return',
              cell: (row) => (
                <Link href={`/admin/fulfilment/returns/${row.id}`} className="font-medium text-accent-hover hover:underline">
                  {row.number}
                </Link>
              ),
            },
            {
              header: 'Order',
              muted: true,
              cell: (row) => (
                <Link href={`/admin/orders/${row.order.id}`} className="hover:underline">
                  {row.order.number}
                </Link>
              ),
            },
            { header: 'Items', align: 'end', numeric: true, cell: (row) => row.items.reduce((sum, i) => sum + i.quantity, 0) },
            { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
            { header: 'Requested', muted: true, cell: (row) => formatDateTime(row.requestedAt) },
            {
              header: 'Refund',
              align: 'end',
              numeric: true,
              cell: (row) => (row.refundAmount != null ? formatMoney(row.refundAmount) : '—'),
            },
          ]}
        />
      </div>
    </>
  );
}
