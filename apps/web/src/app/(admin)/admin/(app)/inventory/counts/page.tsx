'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/common/status-badge';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import Link from 'next/link';
import { formatDateTime } from '@newax/shared';

import { DataTable } from '@/components/ui';
interface StockCount {
  id: string;
  countNumber: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  note: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  creator: { firstName: string | null; lastName: string | null } | null;
}

export default function CountsListPage() {
  const { can } = useAdminSession();
  const [counts, setCounts] = useState<StockCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    adminFetch<{ data: StockCount[] }>('/admin/inventory/counts')
      .then((res) => setCounts(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, []);

  if (!can('inventory.count')) {
    return <p className="p-4 text-red-600">Permission denied: requires inventory.count</p>;
  }

  const handleCreate = async () => {
    try {
      const res = await adminFetch<{ data: StockCount }>('/admin/inventory/counts', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      window.location.href = `/admin/inventory/counts/${res.data.id}`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create a count');
    }
  };

  return (
    <>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">Stock Counts</h1>
          <p className="text-sm text-neutral-900/60">
            Run physical inventory counts and resolve variances against the ledger.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={handleCreate}>
          New Count
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      <div className="card overflow-hidden">
        <DataTable
          rows={counts}
          loading={busy && !counts}
          emptyLabel="No stock counts found."
          rowKey={(c) => c.id}
          className="min-w-[600px]"
          columns={[
            {
              header: 'Number',
              cell: (c) => (
                <Link href={`/admin/inventory/counts/${c.id}`} className="text-accent-hover hover:underline">
                  {c.countNumber}
                </Link>
              ),
              className: 'font-medium',
            },
            {
              header: 'Status',
              // The seventh hand-rolled status pill, and the last place in
              // the app still on Tailwind's stock `gray` rather than the
              // neutral ramp. Tone belongs to the badge, which decides it
              // by meaning rather than by each page picking a colour.
              cell: (c) => <StatusBadge status={c.status} />,
            },
            {
              header: 'Started',
              cell: (c) => (c.startedAt ? formatDateTime(c.startedAt) : '-'),
              muted: true,
            },
            {
              header: 'Creator',
              cell: (c) => (c.creator ? `${c.creator.firstName || ''} ${c.creator.lastName || ''}`.trim() : '-'),
              muted: true,
            },
          ]}
        />
      </div>
    </>
  );
}
