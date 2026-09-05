'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney } from '@yaseen/shared';

interface Supplier {
  id: string;
  name: string;
}

interface ReorderSuggestion {
  id: string;
  sku: string;
  stock: number;
  reorderPoint: number;
  reorderQuantity: number | null;
  preferredSupplier: Supplier | null;
  lastCost: number;
  moq: number;
  product: { id: string; name: string };
  size: string | null;
  color: string | null;
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-3 py-3 text-start font-medium text-neutral-900/70', className)}>
      {children}
    </th>
  );
}

export default function ReorderSuggestionsPage() {
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  // Set of selected variant IDs
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<ReorderSuggestion[]>('/admin/inventory/reorder')
      .then((res) => {
        setSuggestions(res || []);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load suggestions'))
      .finally(() => setBusy(false));
  }, []);

  const toggleAll = () => {
    if (!suggestions) return;
    if (selectedIds.size === suggestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(suggestions.map(s => s.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleCreatePOs = async () => {
    if (selectedIds.size === 0 || !suggestions) return;
    
    setCreating(true);
    setError(null);
    setSuccess(null);
    
    // Group selected suggestions by supplierId
    const selected = suggestions.filter(s => selectedIds.has(s.id));
    const bySupplier = new Map<string, ReorderSuggestion[]>();
    const withoutSupplier: ReorderSuggestion[] = [];
    
    for (const item of selected) {
      if (!item.preferredSupplier) {
        withoutSupplier.push(item);
        continue;
      }
      const existing = bySupplier.get(item.preferredSupplier.id) || [];
      existing.push(item);
      bySupplier.set(item.preferredSupplier.id, existing);
    }
    
    if (withoutSupplier.length > 0) {
      setError(`Cannot create POs for items without a preferred supplier. (${withoutSupplier.map(s => s.sku).join(', ')})`);
      setCreating(false);
      return;
    }

    try {
      let createdCount = 0;
      for (const [supplierId, items] of Array.from(bySupplier.entries())) {
        await adminFetch('/admin/purchase-orders', {
          method: 'POST',
          body: {
            supplierId,
            items: items.map(item => {
              // Calculate qty based on reorder requirements and MOQ
              let needed = (item.reorderQuantity || (item.reorderPoint - item.stock));
              if (needed < item.moq) needed = item.moq;
              
              return {
                variantId: item.id,
                quantityOrdered: needed,
                unitCost: item.lastCost,
              };
            })
          }
        });
        createdCount++;
      }
      
      setSuccess(`Successfully created ${createdCount} draft Purchase Order(s).`);
      setSelectedIds(new Set());
      
      // Reload suggestions
      setBusy(true);
      const res = await adminFetch<ReorderSuggestion[]>('/admin/inventory/reorder');
      setSuggestions(res || []);
      setBusy(false);
      
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create POs');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Reorder Suggestions</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Variants below their reorder point. Select items to draft purchase orders automatically.
      </p>

      {error ? <p role="alert" className="card mb-4 p-4 text-sm text-red-700">{error}</p> : null}
      {success ? <p role="alert" className="card mb-4 p-4 text-sm text-green-700">{success}</p> : null}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-neutral-900/70">
          {selectedIds.size} selected
        </p>
        <button 
          onClick={handleCreatePOs} 
          disabled={selectedIds.size === 0 || creating}
          className="btn-primary"
        >
          {creating ? 'Creating...' : 'Create draft POs'}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 whitespace-nowrap">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  <input 
                    type="checkbox" 
                    className="rounded border-neutral-200 text-accent-hover focus:ring-accent"
                    checked={suggestions?.length !== 0 && selectedIds.size === suggestions?.length}
                    onChange={toggleAll}
                  />
                </th>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th>Supplier</Th>
                <Th className="text-end">Stock</Th>
                <Th className="text-end">Threshold</Th>
                <Th className="text-end">Last Cost</Th>
                <Th className="text-end">MOQ</Th>
                <Th className="text-end">Suggested Qty</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white">
              {busy && !suggestions ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-neutral-900/50">Loading...</td>
                </tr>
              ) : suggestions?.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-neutral-900/50">No reorder suggestions right now.</td>
                </tr>
              ) : (
                suggestions?.map((variant) => {
                  let suggestedQty = (variant.reorderQuantity || (variant.reorderPoint - variant.stock));
                  if (suggestedQty < variant.moq) suggestedQty = variant.moq;

                  return (
                    <tr key={variant.id} className={cn("hover:bg-neutral-50/50", selectedIds.has(variant.id) && "bg-neutral-50/30")}>
                      <td className="px-3 py-3 text-center">
                        <input 
                          type="checkbox" 
                          className="rounded border-neutral-200 text-accent-hover focus:ring-accent"
                          checked={selectedIds.has(variant.id)}
                          onChange={() => toggleOne(variant.id)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-neutral-900">{variant.product.name}</div>
                        <div className="text-xs text-neutral-900/60">
                          {[variant.size, variant.color].filter(Boolean).join(' / ')}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-neutral-900/80">{variant.sku}</td>
                      <td className="px-3 py-3 text-neutral-900/80">
                        {variant.preferredSupplier ? variant.preferredSupplier.name : <span className="text-red-500">No Supplier</span>}
                      </td>
                      <td className="px-3 py-3 text-end font-medium text-red-600">
                        {variant.stock}
                      </td>
                      <td className="px-3 py-3 text-end text-neutral-900/60">{variant.reorderPoint}</td>
                      <td className="px-3 py-3 text-end text-neutral-900/80">{formatMoney(variant.lastCost)}</td>
                      <td className="px-3 py-3 text-end text-neutral-900/60">{variant.moq}</td>
                      <td className="px-3 py-3 text-end font-medium text-accent-hover">
                        {suggestedQty}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
