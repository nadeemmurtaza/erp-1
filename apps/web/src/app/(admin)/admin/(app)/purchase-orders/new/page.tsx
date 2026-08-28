'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney } from '@yaseen/shared';

interface Supplier {
  id: string;
  name: string;
}

interface SupplierProduct {
  id: string;
  variantId: string;
  supplierSku: string | null;
  lastCost: number;
  moq: number;
  variant: {
    sku: string;
    product: { name: string };
    size: string | null;
    color: string | null;
  };
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Line items state
  const [lines, setLines] = useState<Array<{ variantId: string; qty: number; cost: number; sku: string; name: string }>>([]);
  const [freightCost, setFreightCost] = useState(0);
  const [dutyCost, setDutyCost] = useState(0);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ data: Supplier[] }>('/api/admin/suppliers')
      .then((res) => setSuppliers(res.data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!supplierId) {
      setSupplierProducts([]);
      return;
    }
    setLoadingProducts(true);
    adminFetch<{ data: SupplierProduct[] }>(`/api/admin/suppliers/${supplierId}/products`)
      .then((res) => setSupplierProducts(res.data))
      .catch(console.error)
      .finally(() => setLoadingProducts(false));
  }, [supplierId]);

  const addLine = (sp: SupplierProduct) => {
    if (lines.some(l => l.variantId === sp.variantId)) return;
    setLines([...lines, { 
      variantId: sp.variantId, 
      qty: sp.moq || 1, 
      cost: sp.lastCost,
      sku: sp.variant.sku,
      name: `${sp.variant.product.name} ${sp.variant.size || ''} ${sp.variant.color || ''}`.trim()
    }]);
  };

  const removeLine = (index: number) => {
    const newLines = [...lines];
    newLines.splice(index, 1);
    setLines(newLines);
  };

  const updateLine = (index: number, field: 'qty' | 'cost', value: number) => {
    const newLines = [...lines];
    newLines[index][field] = value;
    setLines(newLines);
  };

  const submit = async (send: boolean) => {
    if (!supplierId || lines.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const result = await adminFetch<{ id: string }>('/api/admin/purchase-orders', {
        method: 'POST',
        body: {
          supplierId,
          freightCost,
          dutyCost,
          items: lines.map(l => ({
            variantId: l.variantId,
            quantityOrdered: l.qty,
            unitCost: l.cost,
          }))
        }
      });
      
      if (send) {
        await adminFetch(`/api/admin/purchase-orders/${result.id}/send`, { method: 'POST' });
      }
      
      router.push(`/admin/purchase-orders/${result.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create PO');
      setSaving(false);
    }
  };

  const subtotal = lines.reduce((acc, l) => acc + (l.qty * l.cost), 0);
  const total = subtotal + freightCost + dutyCost;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">New Purchase Order</h1>
      <p className="mb-6 text-sm text-ink/60">
        Draft a new order to send to a supplier.
      </p>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="card p-6 mb-6">
        <label className="block mb-2 text-sm font-medium text-ink">Supplier</label>
        <select 
          className="field-input w-full max-w-md"
          value={supplierId}
          onChange={(e) => {
            setSupplierId(e.target.value);
            setLines([]);
          }}
        >
          <option value="">Select a supplier...</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {supplierId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-sand-200 bg-sand-50">
                <h2 className="font-medium text-ink">Order Lines</h2>
              </div>
              {lines.length === 0 ? (
                <div className="p-8 text-center text-ink/50 text-sm">
                  Add items from the catalogue.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-sand-50/50 border-b border-sand-100">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium text-ink/70">Item</th>
                      <th className="px-3 py-2 text-end font-medium text-ink/70">Qty</th>
                      <th className="px-3 py-2 text-end font-medium text-ink/70">Cost (paisa)</th>
                      <th className="px-3 py-2 text-end font-medium text-ink/70">Line Total</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-100">
                    {lines.map((line, i) => (
                      <tr key={line.variantId}>
                        <td className="px-3 py-3">
                          <div className="font-medium text-ink">{line.name}</div>
                          <div className="text-xs text-ink/60">{line.sku}</div>
                        </td>
                        <td className="px-3 py-3 text-end">
                          <input 
                            type="number" 
                            min="1" 
                            className="field-input w-20 text-end"
                            value={line.qty}
                            onChange={(e) => updateLine(i, 'qty', parseInt(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-3 py-3 text-end">
                          <input 
                            type="number" 
                            min="0" 
                            className="field-input w-24 text-end"
                            value={line.cost}
                            onChange={(e) => updateLine(i, 'cost', parseInt(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-3 py-3 text-end font-medium">
                          {formatMoney(line.qty * line.cost)}
                        </td>
                        <td className="px-3 py-3 text-end">
                          <button onClick={() => removeLine(i)} className="text-red-600 hover:underline text-xs">
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card p-6">
              <h2 className="font-medium text-ink mb-4">Additional Costs</h2>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-sm text-ink/70 mb-1">Freight (paisa)</label>
                  <input 
                    type="number" 
                    className="field-input w-full"
                    value={freightCost}
                    onChange={e => setFreightCost(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="block text-sm text-ink/70 mb-1">Duty (paisa)</label>
                  <input 
                    type="number" 
                    className="field-input w-full"
                    value={dutyCost}
                    onChange={e => setDutyCost(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>
            
            <div className="card p-6 flex flex-col items-end">
              <div className="text-sm text-ink/70 mb-2">Subtotal: {formatMoney(subtotal)}</div>
              <div className="text-lg font-bold text-ink mb-6">Total: {formatMoney(total)}</div>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => submit(false)}
                  disabled={saving || lines.length === 0}
                  className="px-4 py-2 bg-sand-200 text-ink rounded font-medium hover:bg-sand-300 disabled:opacity-50"
                >
                  Save Draft
                </button>
                <button 
                  onClick={() => submit(true)}
                  disabled={saving || lines.length === 0}
                  className="btn-primary"
                >
                  Send to Supplier
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="card p-4">
              <h2 className="font-medium text-ink mb-4">Supplier Catalogue</h2>
              {loadingProducts ? (
                <p className="text-sm text-ink/50">Loading catalogue...</p>
              ) : supplierProducts.length === 0 ? (
                <p className="text-sm text-ink/50">This supplier has no products linked.</p>
              ) : (
                <ul className="space-y-3">
                  {supplierProducts.map(sp => (
                    <li key={sp.id} className="flex items-center justify-between border-b border-sand-100 pb-2 last:border-0">
                      <div>
                        <div className="text-sm font-medium">{sp.variant.product.name}</div>
                        <div className="text-xs text-ink/60">{sp.variant.sku}</div>
                      </div>
                      <button 
                        onClick={() => addLine(sp)}
                        disabled={lines.some(l => l.variantId === sp.variantId)}
                        className="text-xs font-medium text-brand-600 hover:underline disabled:text-ink/30 disabled:no-underline"
                      >
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
