'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDate, formatMoney } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { DataTable, FilterBar, useFilterParam } from '@/components/ui';

interface PurchaseOrderListRow {
  id: string;
  number: string;
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  total: number;
  expectedAt: string | null;
  createdAt: string;
  supplier: { id: string; name: string };
}

const STATUS_OPTIONS = ['DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED'].map((value) => ({
  value,
  label: value,
}));

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PurchaseOrderListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const statusFilter = useFilterParam('status');

  useEffect(() => {
    setBusy(true);
    setError(null);
    adminFetch<{ data: PurchaseOrderListRow[] }>('/admin/purchase-orders', {
      query: { status: statusFilter || undefined },
    })
      .then((res) => setPos(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load purchase orders'))
      .finally(() => setBusy(false));
  }, [statusFilter]);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">Purchase Orders</h1>
          <p className="text-sm text-neutral-900/60">
            Manage incoming stock from suppliers.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={ROUTES.admin.purchasingSpend} className="btn-secondary">
            Spend
          </Link>
          <Link href={ROUTES.admin.transfers} className="btn-secondary">
            Transfers
          </Link>
          <Link href={ROUTES.admin.purchaseOrderNew} className="btn-primary">
            New PO
          </Link>
        </div>
      </div>

      <FilterBar
        filters={[
          { key: 'status', type: 'select', placeholder: 'All statuses', options: STATUS_OPTIONS },
        ]}
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        <DataTable
          rows={pos}
          loading={busy && !pos}
          emptyLabel="No purchase orders found."
          rowKey={(po) => po.id}
          columns={[
            {
              header: 'PO Number',
              cell: (po) => (
                <Link
                  href={`/admin/purchase-orders/${po.id}`}
                  className="font-medium text-accent-hover hover:underline"
                >
                  {po.number}
                </Link>
              ),
            },
            { header: 'Supplier', cell: (po) => po.supplier.name, muted: true },
            {
              header: 'Status',
              cell: (po) => (
                <span
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    po.status === 'DRAFT'
                      ? 'bg-neutral-100 text-neutral-900/80'
                      : po.status === 'SENT'
                        ? 'bg-blue-100 text-blue-800'
                        : po.status === 'PARTIAL'
                          ? 'bg-amber-100 text-amber-800'
                          : po.status === 'RECEIVED'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800',
                  )}
                >
                  {po.status}
                </span>
              ),
            },
            { header: 'Date', cell: (po) => formatDate(po.createdAt), muted: true },
            {
              header: 'Expected',
              cell: (po) => (po.expectedAt ? formatDate(po.expectedAt) : '—'),
              muted: true,
            },
            {
              header: 'Total',
              align: 'end',
              numeric: true,
              cell: (po) => formatMoney(po.total),
            },
          ]}
        />
      </div>
    </>
  );
}
