'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import { formatMoney } from '@yaseen/shared';

interface InventoryVariant {
  id: string;
  sku: string;
  barcode: string | null;
  size: string | null;
  color: string | null;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
  costPrice: number;
  salesStat: {
    daysOfCover: number | null;
    lastSoldAt: string | null;
    ageDays: number | null;
  } | null;
  product: { id: string; name: string };
}

interface StockMovementRow {
  id: string;
  delta: number;
  resultingStock: number;
  reason: string;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-3 py-3 text-start font-medium text-neutral-900/70', className)}>
      {children}
    </th>
  );
}

export default function AdminInventoryPage() {
  const user = getStoredUser();
  const canViewCost = user?.permissions.includes('inventory.view_cost');

  const [variants, setVariants] = useState<InventoryVariant[] | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out' | 'slow'>('all');
  
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<StockMovementRow[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setVariants(
        await adminFetch<InventoryVariant[]>('/admin/inventory', {
          query: { search: search || undefined, filter: filter !== 'all' ? filter : undefined },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load inventory');
    } finally {
      setBusy(false);
    }
  }, [search, filter]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function toggleHistory(variantId: string): Promise<void> {
    if (openHistoryId === variantId) {
      setOpenHistoryId(null);
      return;
    }
    setOpenHistoryId(variantId);
    setHistoryRows(null);
    setHistoryBusy(true);
    setError(null);
    try {
      setHistoryRows(
        await adminFetch<StockMovementRow[]>(`/admin/inventory/${variantId}/history`),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load history');
    } finally {
      setHistoryBusy(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Inventory</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Stock on hand and movement ledger.
      </p>

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <input
          type="search"
          placeholder="Search SKU or product"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="field-input max-w-xs"
        />
        <div className="flex gap-2">
          {(['all', 'low', 'out', 'slow'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1 rounded text-sm',
                filter === f ? 'bg-neutral-100 text-accent-hover font-medium' : 'bg-white text-neutral-900/70 hover:bg-neutral-100'
              )}
            >
              {f === 'all' ? 'All' : f === 'low' ? 'Low Stock' : f === 'out' ? 'Out of Stock' : 'Slow Movers'}
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
            <thead className="border-b border-neutral-100 bg-neutral-50 whitespace-nowrap">
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th>Barcode</Th>
                <Th className="text-end">Stock</Th>
                <Th className="text-end">Threshold</Th>
                {canViewCost && (
                  <>
                    <Th className="text-end">Cost</Th>
                    <Th className="text-end">Stock Value</Th>
                  </>
                )}
                <Th className="text-end">Days of Cover</Th>
                <Th>Last Sold</Th>
                <Th className="text-end">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white">
              {busy && !variants ? (
                <tr>
                  <td colSpan={canViewCost ? 10 : 8} className="p-8 text-center text-neutral-900/50">
                    Loading...
                  </td>
                </tr>
              ) : variants?.length === 0 ? (
                <tr>
                  <td colSpan={canViewCost ? 10 : 8} className="p-8 text-center text-neutral-900/50">
                    No variants found.
                  </td>
                </tr>
              ) : (
                variants?.map((variant) => {
                  const historyOpen = openHistoryId === variant.id;
                  
                  return (
                    <Fragment key={variant.id}>
                      <tr className="hover:bg-neutral-50/50">
                        <td className="px-3 py-3">
                          <div className="font-medium text-neutral-900">{variant.product.name}</div>
                          <div className="text-xs text-neutral-900/60">
                            {[variant.size, variant.color].filter(Boolean).join(' / ')}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-neutral-900/80">{variant.sku}</td>
                        <td className="px-3 py-3 text-neutral-900/60">{variant.barcode || '—'}</td>
                        <td className="px-3 py-3 text-end font-medium">
                          <span className={cn(
                            variant.stock <= 0 ? 'text-red-600' :
                            variant.stock <= variant.lowStockThreshold ? 'text-amber-600' :
                            'text-green-600'
                          )}>
                            {variant.stock}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-end text-neutral-900/60">{variant.lowStockThreshold}</td>
                        
                        {canViewCost && (
                          <>
                            <td className="px-3 py-3 text-end text-neutral-900/80">{formatMoney(variant.costPrice)}</td>
                            <td className="px-3 py-3 text-end font-medium text-neutral-900/90">
                              {formatMoney(variant.stock * variant.costPrice)}
                            </td>
                          </>
                        )}
                        
                        <td className="px-3 py-3 text-end text-neutral-900/60">
                          {variant.salesStat?.daysOfCover !== undefined && variant.salesStat?.daysOfCover !== null 
                            ? Math.round(variant.salesStat.daysOfCover)
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-neutral-900/60">
                          {variant.salesStat?.lastSoldAt 
                            ? new Date(variant.salesStat.lastSoldAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-end">
                          <button
                            type="button"
                            onClick={() => toggleHistory(variant.id)}
                            className="text-accent-hover hover:underline"
                          >
                            {historyOpen ? 'Hide ledger' : 'Ledger'}
                          </button>
                        </td>
                      </tr>

                      {historyOpen ? (
                        <tr className="bg-neutral-50">
                          <td colSpan={canViewCost ? 10 : 8} className="px-4 py-4">
                            {historyBusy ? (
                              <p className="text-sm text-neutral-900/50">Loading ledger...</p>
                            ) : !historyRows || historyRows.length === 0 ? (
                              <p className="text-sm text-neutral-900/50">No movements recorded yet.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr>
                                      <th className="py-1 text-start font-medium text-neutral-900/50">Date</th>
                                      <th className="py-1 text-start font-medium text-neutral-900/50">Actor</th>
                                      <th className="py-1 text-start font-medium text-neutral-900/50">Reason</th>
                                      <th className="py-1 text-start font-medium text-neutral-900/50">Ref</th>
                                      <th className="py-1 text-start font-medium text-neutral-900/50">Note</th>
                                      <th className="py-1 text-end font-medium text-neutral-900/50">Delta</th>
                                      <th className="py-1 text-end font-medium text-neutral-900/50">Balance</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-100">
                                    {historyRows.map((row) => (
                                      <tr key={row.id}>
                                        <td className="py-2 text-neutral-900/70">
                                          {new Date(row.createdAt).toLocaleString()}
                                        </td>
                                        <td className="py-2 text-neutral-900/70">{row.actorName || 'System'}</td>
                                        <td className="py-2 text-neutral-900/70">{row.reason}</td>
                                        <td className="py-2 text-neutral-900/70">
                                          {row.refType ? `${row.refType} ${row.refId || ''}` : '—'}
                                        </td>
                                        <td className="py-2 text-neutral-900/70 max-w-xs truncate" title={row.note || undefined}>
                                          {row.note || '—'}
                                        </td>
                                        <td className="py-2 text-end font-medium">
                                          <span className={row.delta > 0 ? 'text-green-600' : 'text-red-600'}>
                                            {row.delta > 0 ? '+' : ''}{row.delta}
                                          </span>
                                        </td>
                                        <td className="py-2 text-end text-neutral-900/80">{row.resultingStock}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
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
