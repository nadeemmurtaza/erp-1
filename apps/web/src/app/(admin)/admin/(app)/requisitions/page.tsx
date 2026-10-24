'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDate } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { DataTable, EmptyState, FilterBar, PageHeader, useFilterParam } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface RequisitionRow {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CONVERTED';
  justification: string;
  createdAt: string;
  lines: Array<{ id: string; quantity: number; variant: { sku: string; label: string } }>;
}

const STATUS_OPTIONS = ['PENDING', 'APPROVED', 'REJECTED', 'CONVERTED'].map((value) => ({ value, label: value }));

export default function RequisitionsPage() {
  const [rows, setRows] = useState<RequisitionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const statusFilter = useFilterParam('status');

  useEffect(() => {
    setBusy(true);
    setError(null);
    adminFetch<{ data: RequisitionRow[] }>('/admin/requisitions', { query: { status: statusFilter || undefined } })
      .then((res) => setRows(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load requisitions'))
      .finally(() => setBusy(false));
  }, [statusFilter]);

  return (
    <>
      <PageHeader
        title="Requisitions"
        description="Requests to buy, reviewed before they become a purchase order."
        action={
          <Link href={ROUTES.admin.requisitionNew} className="btn-primary">
            New requisition
          </Link>
        }
      />

      <FilterBar filters={[{ key: 'status', type: 'select', placeholder: 'All statuses', options: STATUS_OPTIONS }]} />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        {rows && rows.length === 0 ? (
          <EmptyState
            title="No requisitions"
            description="Nothing has been requested yet, or none match this filter."
            action={
              <Link href={ROUTES.admin.requisitionNew} className="btn-primary">
                New requisition
              </Link>
            }
          />
        ) : (
          <DataTable
            rows={rows}
            loading={busy && !rows}
            emptyLabel="No requisitions found."
            rowKey={(r) => r.id}
            columns={[
              {
                header: 'Requested',
                cell: (r) => (
                  <Link href={ROUTES.admin.requisition(r.id)} className="font-medium text-accent-hover hover:underline">
                    {r.lines.length} line{r.lines.length === 1 ? '' : 's'}
                  </Link>
                ),
              },
              { header: 'Justification', cell: (r) => r.justification, muted: true },
              { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
              { header: 'Date', cell: (r) => formatDate(r.createdAt), muted: true },
            ]}
          />
        )}
      </div>
    </>
  );
}
