'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney } from '@newax/shared';
import { PartyPicker } from '@/components/admin/party-picker';
import { DataTable, Loading } from '@/components/ui';
import { Select } from '@/components/ui/select';

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
  const [supplierId, setSupplierId] = useState('');

  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Line items state
  const [lines, setLines] = useState<Array<{ variantId: string; qty: number; cost: number; sku: string; name: string }>>([]);
  const [freightCost, setFreightCost] = useState(0);
  const [dutyCost, setDutyCost] = useState(0);
  // RETAIL-ERP.md R13 (WO-23.3): defaults to BRAND, same as the API — ORG
  // names org-central buying (received into an org warehouse and pushed
  // down as transfers, R13); BRANCH is gated server-side by the brand's own
  // allowBranchLocalPurchasing switch.
  const [scopeLevel, setScopeLevel] = useState<'ORG' | 'BRAND' | 'BRANCH'>('BRAND');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supplierId) {
      setSupplierProducts([]);
      return;
    }
    setLoadingProducts(true);
    adminFetch<{ data: SupplierProduct[] }>(`/admin/suppliers/${supplierId}/products`)
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
      const result = await adminFetch<{ id: string }>('/admin/purchase-orders', {
        method: 'POST',
        body: {
          supplierId,
          freightCost,
          dutyCost,
          scopeLevel,
          items: lines.map(l => ({
            variantId: l.variantId,
            quantityOrdered: l.qty,
            unitCost: l.cost,
          }))
        }
      });
      
      if (send) {
        await adminFetch(`/admin/purchase-orders/${result.id}/send`, { method: 'POST' });
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
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">New Purchase Order</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Draft a new order to send to a supplier.
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card p-6 mb-6">
        <label htmlFor="po-supplier" className="mb-2 block text-sm font-medium text-neutral-900">
          Supplier
        </label>
        <PartyPicker
          id="po-supplier"
          partyRole="SUPPLIER"
          value={supplierId}
          className="max-w-md"
          placeholder="Search suppliers by name or phone..."
          onSelect={(result) => {
            if (!result.supplierId) return;
            setSupplierId(result.supplierId);
            setLines([]);
          }}
        />

        <label htmlFor="po-scope" className="mb-2 mt-4 block text-sm font-medium text-neutral-900">
          Scope
        </label>
        <Select
          id="po-scope"
          label="Scope"
          className="max-w-md"
          value={scopeLevel}
          onChange={(next) => setScopeLevel(next as 'ORG' | 'BRAND' | 'BRANCH')}
          options={[
            { value: 'BRAND', label: 'Brand (default)' },
            { value: 'ORG', label: 'Organization' },
            { value: 'BRANCH', label: 'Branch' },
          ]}
        />
        <p className="mt-1 text-sm text-neutral-900/70">
          {
            {
              BRAND: 'This brand buys for itself.',
              ORG: 'Central purchasing for several brands.',
              BRANCH: 'Local purchasing, if this brand allows it.',
            }[scopeLevel]
          }
        </p>
      </div>

      {supplierId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="overflow-hidden">
              <div className="p-4 border-b border-neutral-100 bg-neutral-50">
                <h2 className="font-medium text-neutral-900">Order Lines</h2>
              </div>
              {lines.length === 0 ? (
                <div className="p-8 text-center text-neutral-900/60 text-sm">
                  Add items from the catalogue.
                </div>
              ) : (
                <DataTable
                  rows={lines}
                  rowKey={(line) => line.variantId}
                  columns={[
                    {
                      header: 'Item',
                      cell: (line) => (
                        <>
                          <div className="font-medium text-neutral-900">{line.name}</div>
                          <div className="text-xs text-neutral-900/60">{line.sku}</div>
                        </>
                      ),
                    },
                    {
                      header: 'Qty',
                      align: 'end',
                      cell: (line, i) => (
                        <input
                          type="number"
                          min="1"
                          className="field-input w-20 text-end"
                          value={line.qty}
                          onChange={(e) => updateLine(i, 'qty', parseInt(e.target.value) || 0)}
                        />
                      ),
                    },
                    {
                      header: 'Cost (paisa)',
                      align: 'end',
                      cell: (line, i) => (
                        <input
                          type="number"
                          min="0"
                          className="field-input w-24 text-end"
                          value={line.cost}
                          onChange={(e) => updateLine(i, 'cost', parseInt(e.target.value) || 0)}
                        />
                      ),
                    },
                    {
                      header: 'Line Total',
                      align: 'end',
                      numeric: true,
                      cell: (line) => <span className="font-medium">{formatMoney(line.qty * line.cost)}</span>,
                    },
                    {
                      header: '',
                      align: 'end',
                      cell: (_line, i) => (
                        <button onClick={() => removeLine(i)} className="text-red-600 hover:underline text-xs">
                          Remove
                        </button>
                      ),
                    },
                  ]}
                />
              )}
            </div>

            <div className="card p-6">
              <h2 className="font-medium text-neutral-900 mb-4">Additional Costs</h2>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div>
                  <label htmlFor="po-freight" className="block text-sm text-neutral-900/70 mb-1">
                    Freight (paisa)
                  </label>
                  <input
                    id="po-freight"
                    type="number"
                    className="field-input w-full"
                    value={freightCost}
                    onChange={e => setFreightCost(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label htmlFor="po-duty" className="block text-sm text-neutral-900/70 mb-1">
                    Duty (paisa)
                  </label>
                  <input
                    id="po-duty"
                    type="number"
                    className="field-input w-full"
                    value={dutyCost}
                    onChange={e => setDutyCost(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>
            
            <div className="card p-6 flex flex-col items-end">
              <div className="text-sm text-neutral-900/70 mb-2">Subtotal: {formatMoney(subtotal)}</div>
              <div className="text-lg font-bold text-neutral-900 mb-6">Total: {formatMoney(total)}</div>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => submit(false)}
                  disabled={saving || lines.length === 0}
                  className="btn-secondary"
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
              <h2 className="font-medium text-neutral-900 mb-4">Supplier Catalogue</h2>
              {loadingProducts ? (
                <Loading label="Loading catalogue" />
              ) : supplierProducts.length === 0 ? (
                <p className="text-sm text-neutral-900/60">This supplier has no products linked.</p>
              ) : (
                <ul className="space-y-3">
                  {supplierProducts.map(sp => (
                    <li key={sp.id} className="flex items-center justify-between border-b border-white pb-2 last:border-0">
                      <div>
                        <div className="text-sm font-medium">{sp.variant.product.name}</div>
                        <div className="text-xs text-neutral-900/60">{sp.variant.sku}</div>
                      </div>
                      <button 
                        onClick={() => addLine(sp)}
                        disabled={lines.some(l => l.variantId === sp.variantId)}
                        className="text-xs font-medium text-accent-hover hover:underline disabled:text-neutral-900/60 disabled:no-underline"
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
