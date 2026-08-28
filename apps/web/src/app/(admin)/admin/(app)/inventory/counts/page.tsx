'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import Link from 'next/link';

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
    adminFetch<{ data: StockCount[] }>('/api/admin/inventory/counts')
      .then((res) => setCounts(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, []);

  if (!user?.permissions.includes('inventory.count')) {
    return <p className="p-4 text-red-600">Permission denied: requires inventory.count</p>;
  }

  const handleCreate = async () => {
    try {
      const res = await adminFetch<{ data: StockCount }>('/api/admin/inventory/counts', {
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
          <h1 className="mb-1 text-xl font-semibold text-ink">Stock Counts</h1>
          <p className="text-sm text-ink/60">
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
            <tr className="border-b border-sand-200">
              <th className="px-4 py-2 font-semibold text-ink/50 uppercase text-xs">Number</th>
              <th className="px-4 py-2 font-semibold text-ink/50 uppercase text-xs">Status</th>
              <th className="px-4 py-2 font-semibold text-ink/50 uppercase text-xs">Started</th>
              <th className="px-4 py-2 font-semibold text-ink/50 uppercase text-xs">Creator</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {busy && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink/50">
                  Loading counts...
                </td>
              </tr>
            )}
            {!busy && counts?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink/50">
                  No stock counts found.
                </td>
              </tr>
            )}
            {counts?.map((c) => (
              <tr key={c.id} className="hover:bg-sand-50">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/admin/inventory/counts/${c.id}`} className="text-brand-600 hover:underline">
                    {c.countNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={clsx(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    c.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                    c.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  )}>
                    {c.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink/70">
                  {c.startedAt ? new Date(c.startedAt).toLocaleString() : '-'}
                </td>
                <td className="px-4 py-3 text-ink/70">
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
