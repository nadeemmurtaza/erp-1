'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';
import { formatDate, formatDateTime, formatMoney } from '@newax/shared';

interface PurchaseOrder {
  id: string;
  number: string;
  supplier: { id: string; name: string };
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  expectedAt: string | null;
  freightCost: number;
  dutyCost: number;
  otherCost: number;
  total: number;
  createdAt: string;
  items: Array<{
    id: string;
    variantId: string;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: number;
    variant: {
      sku: string;
      product: { translations: { name: string }[] };
      size: string | null;
      color: string | null;
    };
  }>;
  receipts: Array<{
    id: string;
    receivedAt: string;
    notes: string | null;
  }>;
}

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    adminFetch<PurchaseOrder>(`/admin/purchase-orders/${id}`)
      .then((res) => setPo(res))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load purchase order'))
      .finally(() => setBusy(false));
  }, [id]);

  if (busy) {
    return <p className="text-sm text-neutral-900/50 p-4">Loading purchase order...</p>;
  }

  if (error || !po) {
    return (
      <p role="alert" className="notice notice-error">
        {error || 'Purchase order not found'}
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-semibold text-neutral-900">PO {po.number}</h1>
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
          </div>
          <p className="text-sm text-neutral-900/60">
            {po.supplier.name} &bull; Created {formatDate(po.createdAt)}
          </p>
        </div>
        {(po.status === 'SENT' || po.status === 'PARTIAL') && (
          <Link href={`/admin/purchase-orders/${po.id}/receive`} className="btn-primary">
            Receive Goods
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="overflow-hidden">
            <div className="p-4 border-b border-neutral-100 bg-neutral-50">
              <h2 className="font-medium text-neutral-900">Order Lines</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="table-flat">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>SKU</th>
                    <th className="text-end">Cost</th>
                    <th className="text-end">Ordered</th>
                    <th className="text-end">Received</th>
                    <th className="text-end">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white">
                  {po.items.map((item) => (
                    <tr key={item.id} className="hover:bg-neutral-50/50">
                      <td>
                        <div className="font-medium text-neutral-900">
                          {item.variant.product.translations[0]?.name || 'Unknown'}
                        </div>
                        <div className="text-xs text-neutral-900/60">
                          {[item.variant.size, item.variant.color].filter(Boolean).join(' / ')}
                        </div>
                      </td>
                      <td className="text-neutral-900/80">{item.variant.sku}</td>
                      <td className="text-end text-neutral-900/80">{formatMoney(item.unitCost)}</td>
                      <td className="text-end font-medium">{item.quantityOrdered}</td>
                      <td className="text-end text-accent-hover font-medium">
                        {item.quantityReceived}
                      </td>
                      <td className="text-end font-medium">
                        {formatMoney(item.quantityOrdered * item.unitCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {po.receipts.length > 0 && (
            <div className="overflow-hidden">
              <div className="p-4 border-b border-neutral-100 bg-neutral-50">
                <h2 className="font-medium text-neutral-900">Goods Receipts</h2>
              </div>
              <ul className="divide-y divide-white">
                {po.receipts.map(r => (
                  <li key={r.id} className="p-4">
                    <div className="font-medium text-neutral-900 mb-1">
                      Received {formatDateTime(r.receivedAt)}
                    </div>
                    {r.notes && <div className="text-sm text-neutral-900/70">{r.notes}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="card p-6">
            <h2 className="font-medium text-neutral-900 mb-4">Summary</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-900/60">Subtotal</dt>
                <dd className="font-medium">
                  {formatMoney(po.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitCost), 0))}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-900/60">Freight</dt>
                <dd className="font-medium">{formatMoney(po.freightCost)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-900/60">Duty</dt>
                <dd className="font-medium">{formatMoney(po.dutyCost)}</dd>
              </div>
              <div className="flex justify-between border-t border-neutral-100 pt-3 mt-3">
                <dt className="text-neutral-900/80 font-medium">Total</dt>
                <dd className="font-bold text-lg">{formatMoney(po.total)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
