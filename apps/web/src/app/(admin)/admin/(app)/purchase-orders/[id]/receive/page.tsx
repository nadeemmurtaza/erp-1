'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';

interface PurchaseOrder {
  id: string;
  number: string;
  supplier: { id: string; name: string };
  status: string;
  items: Array<{
    id: string;
    variantId: string;
    quantityOrdered: number;
    quantityReceived: number;
    variant: {
      sku: string;
      product: { translations: { name: string }[] };
      size: string | null;
      color: string | null;
    };
  }>;
}

export default function ReceiveGoodsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  // Receiving state: map of PO Item ID to quantity receiving in this session
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch<PurchaseOrder>(`/admin/purchase-orders/${id}`)
      .then((res) => {
        setPo(res);
        const qtys: Record<string, number> = {};
        res.items.forEach(item => {
          // Pre-fill with remaining quantity
          qtys[item.id] = Math.max(0, item.quantityOrdered - item.quantityReceived);
        });
        setReceiveQtys(qtys);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load purchase order'))
      .finally(() => setBusy(false));
  }, [id]);

  const handleSubmit = async () => {
    if (!po) return;
    setSaving(true);
    setError(null);
    try {
      const items = po.items
        .filter(item => receiveQtys[item.id] > 0)
        .map(item => ({
          purchaseOrderItemId: item.id,
          quantity: receiveQtys[item.id],
        }));

      if (items.length === 0) {
        throw new Error('No items to receive. Set a quantity > 0.');
      }

      await adminFetch(`/admin/purchase-orders/${id}/receive`, {
        method: 'POST',
        body: { items, notes: notes || undefined },
      });
      
      router.push(`/admin/purchase-orders/${id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not receive goods');
      setSaving(false);
    }
  };

  if (busy) return <p className="text-sm text-neutral-900/60 p-4">Loading receiving sheet...</p>;
  if (error || !po) return <p className="notice notice-error">{error || 'Not found'}</p>;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Receive Goods: PO {po.number}</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Record stock entering the warehouse from {po.supplier.name}.
      </p>

      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}

      <div className="card overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="table-flat">
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th className="text-end">Ordered</th>
                <th className="text-end">Previously Received</th>
                <th className="text-end">Receiving Now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {po.items.map(item => {
                const remaining = Math.max(0, item.quantityOrdered - item.quantityReceived);
                return (
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
                    <td className="text-end font-medium">{item.quantityOrdered}</td>
                    <td className="text-end text-neutral-900/60">{item.quantityReceived}</td>
                    <td className="text-end">
                      <input 
                        type="number" 
                        min="0"
                        className="field-input w-24 text-end font-medium"
                        value={receiveQtys[item.id] || 0}
                        onChange={(e) => setReceiveQtys({ ...receiveQtys, [item.id]: parseInt(e.target.value) || 0 })}
                      />
                      {remaining > 0 && receiveQtys[item.id] !== remaining && (
                        <button
                          type="button"
                          className="mt-1 cursor-pointer text-xs text-neutral-900/60 hover:underline"
                          onClick={() => setReceiveQtys({ ...receiveQtys, [item.id]: remaining })}
                        >
                          Max: {remaining}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-6 max-w-2xl">
        <label htmlFor="receipt-notes" className="block mb-2 text-sm font-medium text-neutral-900">
          Receipt Notes (optional)
        </label>
        <textarea
          id="receipt-notes"
          className="field-input w-full mb-6"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. 2 boxes damaged in transit"
        />
        
        <div className="flex justify-end gap-3">
          <button 
            type="button" 
            onClick={() => router.back()}
            disabled={saving}
            className="px-4 py-2 bg-transparent text-neutral-900/70 hover:text-neutral-900 font-medium"
          >
            Cancel
          </button>
          <button 
            type="button" 
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Receiving...' : 'Confirm Receipt'}
          </button>
        </div>
      </div>
    </>
  );
}
