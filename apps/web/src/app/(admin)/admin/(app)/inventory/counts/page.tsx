'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/common/status-badge';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import Link from 'next/link';
import { formatDateTime } from '@newax/shared';

import { Loading } from '@/components/ui';
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
  const user = getStoredUser();
  const [counts, setCounts] = useState<StockCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    adminFetch<{ data: StockCount[] }>('/admin/inventory/counts')
      .then((res) => setCounts(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, []);

  if (!user?.permissions.includes('inventory.count')) {
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

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-100">
              <th className="px-4 py-2 font-semibold text-neutral-900/50 uppercase text-xs">Number</th>
              <th className="px-4 py-2 font-semibold text-neutral-900/50 uppercase text-xs">Status</th>
              <th className="px-4 py-2 font-semibold text-neutral-900/50 uppercase text-xs">Started</th>
              <th className="px-4 py-2 font-semibold text-neutral-900/50 uppercase text-xs">Creator</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {busy && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center">
                    <Loading className="p-0" />
                  </td>
              </tr>
            )}
            {!busy && counts?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-900/50">
                  No stock counts found.
                </td>
              </tr>
            )}
            {counts?.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/admin/inventory/counts/${c.id}`} className="text-accent-hover hover:underline">
                    {c.countNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {/*
                    The seventh hand-rolled status pill, and the last place in
                    the app still on Tailwind's stock `gray` rather than the
                    neutral ramp. Tone belongs to the badge, which decides it
                    by meaning rather than by each page picking a colour.
                  */}
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-4 py-3 text-neutral-900/70">
                  {c.startedAt ? formatDateTime(c.startedAt) : '-'}
                </td>
                <td className="px-4 py-3 text-neutral-900/70">
                  {c.creator ? `${c.creator.firstName || ''} ${c.creator.lastName || ''}`.trim() : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
