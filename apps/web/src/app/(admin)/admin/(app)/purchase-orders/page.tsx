'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDate, formatMoney } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { Loading } from '@/components/ui';

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
    <th className={cn('px-3 py-3 text-start font-medium text-neutral-900/70', className)}>
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
    adminFetch<{ data: PurchaseOrderListRow[] }>('/admin/purchase-orders', {
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
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">Purchase Orders</h1>
          <p className="text-sm text-neutral-900/60">
            Manage incoming stock from suppliers.
          </p>
        </div>
        <Link href={ROUTES.admin.purchaseOrderNew} className="btn-primary">
          New PO
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-4">
        <span id="po-status-filter-label" className="text-sm font-medium text-neutral-900/70">
          Filter by status:
        </span>
        <div role="group" aria-labelledby="po-status-filter-label" className="flex gap-2">
          {['', 'DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1 rounded text-sm',
                statusFilter === s ? 'bg-neutral-100 text-accent-hover font-medium' : 'bg-white text-neutral-900/70 hover:bg-neutral-100'
              )}
            >
              {s === '' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-flat">
            <thead className="whitespace-nowrap">
              <tr>
                <Th>PO Number</Th>
                <Th>Supplier</Th>
                <Th>Status</Th>
                <Th>Date</Th>
                <Th>Expected</Th>
                <Th className="text-end">Total</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {busy && !pos ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center">
                    <Loading className="p-0" />
                  </td>
                </tr>
              ) : pos?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-900/60">
                    No purchase orders found.
                  </td>
                </tr>
              ) : (
                pos?.map((po) => (
                  <tr key={po.id} className="hover:bg-neutral-50/50">
                    <td className="font-medium">
                      <Link href={`/admin/purchase-orders/${po.id}`} className="text-accent-hover hover:underline">
                        {po.number}
                      </Link>
                    </td>
                    <td className="text-neutral-900/80">{po.supplier.name}</td>
                    <td>
                      <span className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium',
                        po.status === 'DRAFT' ? 'bg-neutral-100 text-neutral-900/80' :
                        po.status === 'SENT' ? 'bg-blue-100 text-blue-800' :
                        po.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800' :
                        po.status === 'RECEIVED' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      )}>
                        {po.status}
                      </span>
                    </td>
                    <td className="text-neutral-900/60">
                      {formatDate(po.createdAt)}
                    </td>
                    <td className="text-neutral-900/60">
                      {po.expectedAt ? formatDate(po.expectedAt) : '—'}
                    </td>
                    <td className="text-end font-medium text-neutral-900/80">
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
