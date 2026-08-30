'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney } from '@yaseen/shared';

interface PurchaseOrderListRow {
  id: string;
  number: string;
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  total: number;
  expectedAt: string | null;
  createdAt: string;
  supplier: { id: string; name: string };
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={clsx('px-3 py-3 text-start font-medium text-ink/70', className)}>
      {children}
    </th>
  );
}

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PurchaseOrderListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    setBusy(true);
    setError(null);
    adminFetch<{ data: PurchaseOrderListRow[] }>('/api/admin/purchase-orders', {
      query: { status: statusFilter || undefined }
    })
      .then((res) => setPos(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load purchase orders'))
      .finally(() => setBusy(false));
  }, [statusFilter]);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-ink">Purchase Orders</h1>
          <p className="text-sm text-ink/60">
            Manage incoming stock from suppliers.
          </p>
        </div>
        <Link href="/admin/purchase-orders/new" className="btn-primary">
          New PO
        </Link>
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <label className="text-sm font-medium text-ink/70">Filter by status:</label>
        <div className="flex gap-2">
          {['', 'DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                'px-3 py-1 rounded text-sm',
                statusFilter === s ? 'bg-brand-100 text-brand-800 font-medium' : 'bg-sand-100 text-ink/70 hover:bg-sand-200'
              )}
            >
              {s === '' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-sand-200 bg-sand-50 whitespace-nowrap">
              <tr>
                <Th>PO Number</Th>
                <Th>Supplier</Th>
                <Th>Status</Th>
                <Th>Date</Th>
                <Th>Expected</Th>
                <Th className="text-end">Total</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {busy && !pos ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink/50">
                    Loading...
                  </td>
                </tr>
              ) : pos?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink/50">
                    No purchase orders found.
                  </td>
                </tr>
              ) : (
                pos?.map((po) => (
                  <tr key={po.id} className="hover:bg-sand-50/50">
                    <td className="px-3 py-3 font-medium">
                      <Link href={`/admin/purchase-orders/${po.id}`} className="text-brand-600 hover:underline">
                        {po.number}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-ink/80">{po.supplier.name}</td>
                    <td className="px-3 py-3">
                      <span className={clsx(
                        'px-2 py-0.5 rounded text-xs font-medium',
                        po.status === 'DRAFT' ? 'bg-sand-200 text-ink/80' :
                        po.status === 'SENT' ? 'bg-blue-100 text-blue-800' :
                        po.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800' :
                        po.status === 'RECEIVED' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      )}>
                        {po.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink/60">
                      {new Date(po.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 text-ink/60">
                      {po.expectedAt ? new Date(po.expectedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-3 text-end font-medium text-ink/80">
                      {formatMoney(po.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
