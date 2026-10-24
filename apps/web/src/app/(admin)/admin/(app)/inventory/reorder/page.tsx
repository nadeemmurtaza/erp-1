'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney } from '@newax/shared';
import { DataTable } from '@/components/ui';

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

      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}
      {success ? <p role="alert" className="notice notice-success mb-4">{success}</p> : null}

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

      <div className="overflow-hidden">
        <DataTable
          rows={suggestions}
          loading={busy && !suggestions}
          emptyLabel="No reorder suggestions right now."
          rowKey={(variant) => variant.id}
          columns={[
            {
              header: (
                <input
                  type="checkbox"
                  className="field-check"
                  checked={suggestions?.length !== 0 && selectedIds.size === suggestions?.length}
                  onChange={toggleAll}
                />
              ),
              cell: (variant) => (
                <input
                  type="checkbox"
                  className="field-check"
                  checked={selectedIds.has(variant.id)}
                  onChange={() => toggleOne(variant.id)}
                />
              ),
            },
            {
              header: 'Product',
              cell: (variant) => (
                <>
                  <div className="font-medium text-neutral-900">{variant.product.name}</div>
                  <div className="text-xs text-neutral-900/60">
                    {[variant.size, variant.color].filter(Boolean).join(' / ')}
                  </div>
                </>
              ),
            },
            { header: 'SKU', cell: (variant) => variant.sku, className: 'text-neutral-900/80' },
            {
              header: 'Supplier',
              cell: (variant) =>
                variant.preferredSupplier ? (
                  variant.preferredSupplier.name
                ) : (
                  <span className="text-red-500">No Supplier</span>
                ),
              className: 'text-neutral-900/80',
            },
            {
              header: 'Stock',
              align: 'end',
              numeric: true,
              cell: (variant) => variant.stock,
              className: 'font-medium text-red-600',
            },
            {
              header: 'Threshold',
              align: 'end',
              numeric: true,
              cell: (variant) => variant.reorderPoint,
              className: 'text-neutral-900/60',
            },
            {
              header: 'Last Cost',
              align: 'end',
              numeric: true,
              cell: (variant) => formatMoney(variant.lastCost),
              className: 'text-neutral-900/80',
            },
            {
              header: 'MOQ',
              align: 'end',
              numeric: true,
              cell: (variant) => variant.moq,
              className: 'text-neutral-900/60',
            },
            {
              header: 'Suggested Qty',
              align: 'end',
              numeric: true,
              cell: (variant) => {
                let suggestedQty = variant.reorderQuantity || variant.reorderPoint - variant.stock;
                if (suggestedQty < variant.moq) suggestedQty = variant.moq;
                return suggestedQty;
              },
              className: 'font-medium text-accent-hover',
            },
          ]}
        />
      </div>
    </>
  );
}
