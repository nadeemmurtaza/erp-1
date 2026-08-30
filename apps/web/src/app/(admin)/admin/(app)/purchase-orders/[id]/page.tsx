'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney } from '@yaseen/shared';

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
    adminFetch<PurchaseOrder>(`/api/admin/purchase-orders/${id}`)
      .then((res) => setPo(res))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load purchase order'))
      .finally(() => setBusy(false));
  }, [id]);

  if (busy) {
    return <p className="text-sm text-ink/50 p-4">Loading purchase order...</p>;
  }

  if (error || !po) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error || 'Purchase order not found'}
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-semibold text-ink">PO {po.number}</h1>
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
          </div>
          <p className="text-sm text-ink/60">
            {po.supplier.name} &bull; Created {new Date(po.createdAt).toLocaleDateString()}
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
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-sand-200 bg-sand-50">
              <h2 className="font-medium text-ink">Order Lines</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-sand-100 bg-sand-50/50">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium text-ink/70">Item</th>
                    <th className="px-3 py-2 text-start font-medium text-ink/70">SKU</th>
                    <th className="px-3 py-2 text-end font-medium text-ink/70">Cost</th>
                    <th className="px-3 py-2 text-end font-medium text-ink/70">Ordered</th>
                    <th className="px-3 py-2 text-end font-medium text-ink/70">Received</th>
                    <th className="px-3 py-2 text-end font-medium text-ink/70">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {po.items.map((item) => (
                    <tr key={item.id} className="hover:bg-sand-50/50">
                      <td className="px-3 py-3">
                        <div className="font-medium text-ink">
                          {item.variant.product.translations[0]?.name || 'Unknown'}
                        </div>
                        <div className="text-xs text-ink/60">
                          {[item.variant.size, item.variant.color].filter(Boolean).join(' / ')}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-ink/80">{item.variant.sku}</td>
                      <td className="px-3 py-3 text-end text-ink/80">{formatMoney(item.unitCost)}</td>
                      <td className="px-3 py-3 text-end font-medium">{item.quantityOrdered}</td>
                      <td className="px-3 py-3 text-end text-brand-700 font-medium">
                        {item.quantityReceived}
                      </td>
                      <td className="px-3 py-3 text-end font-medium">
                        {formatMoney(item.quantityOrdered * item.unitCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {po.receipts.length > 0 && (
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-sand-200 bg-sand-50">
                <h2 className="font-medium text-ink">Goods Receipts</h2>
              </div>
              <ul className="divide-y divide-sand-100">
                {po.receipts.map(r => (
                  <li key={r.id} className="p-4">
                    <div className="font-medium text-ink mb-1">
                      Received {new Date(r.receivedAt).toLocaleString()}
                    </div>
                    {r.notes && <div className="text-sm text-ink/70">{r.notes}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="card p-6">
            <h2 className="font-medium text-ink mb-4">Summary</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink/60">Subtotal</dt>
                <dd className="font-medium">
                  {formatMoney(po.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitCost), 0))}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">Freight</dt>
                <dd className="font-medium">{formatMoney(po.freightCost)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">Duty</dt>
                <dd className="font-medium">{formatMoney(po.dutyCost)}</dd>
              </div>
              <div className="flex justify-between border-t border-sand-200 pt-3 mt-3">
                <dt className="text-ink/80 font-medium">Total</dt>
                <dd className="font-bold text-lg">{formatMoney(po.total)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
