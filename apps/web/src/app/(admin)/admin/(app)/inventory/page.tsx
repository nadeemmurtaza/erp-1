'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';
import { formatDate, formatDateTime, formatMoney } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import {
  DataTable,
  FilterBar,
  Loading,
  PageHeader,
  useFilterParam,
  useSetFilterParam,
} from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

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
  projectedStockoutAt: string | null;
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

const STOCK_FILTERS = ['all', 'low', 'out', 'slow', 'stockout-risk'] as const;
type StockFilter = (typeof STOCK_FILTERS)[number];
const STOCK_FILTER_LABELS: Record<StockFilter, string> = {
  all: 'All',
  low: 'Low Stock',
  out: 'Out of Stock',
  slow: 'Slow Movers',
  'stockout-risk': 'Stockout Risk',
};

export default function AdminInventoryPage() {
  const { can } = useAdminSession();
  const canViewCost = can('inventory.view_cost');
  const canViewChain = can('production.view_chain');
  const canViewInsights = can('analytics.view');

  const [variants, setVariants] = useState<InventoryVariant[] | null>(null);
  const search = useFilterParam('search');
  const filter = (useFilterParam('filter') || 'all') as StockFilter;
  const setFilter = useSetFilterParam('filter');

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
    // FilterBar debounces the search box before it touches the URL.
    load();
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
      <PageHeader
        title="Inventory"
        description="Stock on hand and movement ledger."
        action={
          canViewInsights ? (
            <Link href={ROUTES.admin.inventoryInsights} className="btn-secondary">
              Insights
            </Link>
          ) : undefined
        }
      />

      <FilterBar
        filters={[{ key: 'search', type: 'search', placeholder: 'Search SKU or product' }]}
        trailing={
          <div className="flex flex-wrap gap-2">
            {STOCK_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f === 'all' ? null : f)}
                className={cn(
                  'px-3 py-1 rounded text-sm',
                  filter === f
                    ? 'bg-neutral-100 text-accent-hover font-medium'
                    : 'bg-white text-neutral-900/70 hover:bg-neutral-100',
                )}
              >
                {STOCK_FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        <DataTable
          rows={variants}
          loading={busy && !variants}
          emptyLabel="No variants found."
          rowKey={(variant) => variant.id}
          isRowExpanded={(variant) => openHistoryId === variant.id}
          expandedContent={() =>
            historyBusy ? (
              <Loading label="Loading ledger" />
            ) : !historyRows || historyRows.length === 0 ? (
              <p className="text-sm text-neutral-900/60">No movements recorded yet.</p>
            ) : (
              <DataTable
                rows={historyRows}
                rowKey={(row) => row.id}
                columns={[
                  { header: 'Date', cell: (row) => formatDateTime(row.createdAt), muted: true },
                  { header: 'Actor', cell: (row) => row.actorName || 'System', muted: true },
                  { header: 'Reason', cell: (row) => row.reason, muted: true },
                  {
                    header: 'Ref',
                    cell: (row) => (row.refType ? `${row.refType} ${row.refId || ''}` : '—'),
                    muted: true,
                  },
                  {
                    header: 'Note',
                    cell: (row) => (
                      <span className="block max-w-xs truncate text-neutral-900/70" title={row.note || undefined}>
                        {row.note || '—'}
                      </span>
                    ),
                  },
                  {
                    header: 'Delta',
                    align: 'end',
                    numeric: true,
                    cell: (row) => (
                      <span className={cn('font-medium', row.delta > 0 ? 'text-green-600' : 'text-red-600')}>
                        {row.delta > 0 ? '+' : ''}
                        {row.delta}
                      </span>
                    ),
                  },
                  {
                    header: 'Balance',
                    align: 'end',
                    numeric: true,
                    cell: (row) => row.resultingStock,
                  },
                ]}
              />
            )
          }
          columns={[
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
            { header: 'SKU', cell: (variant) => variant.sku, muted: true },
            { header: 'Barcode', cell: (variant) => variant.barcode || '—', muted: true },
            {
              header: 'Stock',
              align: 'end',
              numeric: true,
              cell: (variant) => (
                <>
                  <span
                    className={cn(
                      'font-medium',
                      variant.stock <= 0
                        ? 'text-red-600'
                        : variant.stock <= variant.lowStockThreshold
                          ? 'text-amber-600'
                          : 'text-green-600',
                    )}
                  >
                    {variant.stock}
                  </span>
                  {variant.projectedStockoutAt && (
                    <div
                      className="text-xs text-red-600 mt-0.5"
                      title={`Forecast to stock out by ${formatDate(variant.projectedStockoutAt)} — before a reorder placed today would arrive`}
                    >
                      Stockout risk
                    </div>
                  )}
                </>
              ),
            },
            {
              header: 'Threshold',
              align: 'end',
              numeric: true,
              cell: (variant) => variant.lowStockThreshold,
              muted: true,
            },
            ...(canViewCost
              ? ([
                  {
                    header: 'Cost',
                    align: 'end' as const,
                    numeric: true,
                    cell: (variant: InventoryVariant) => formatMoney(variant.costPrice),
                    muted: true,
                  },
                  {
                    header: 'Stock Value',
                    align: 'end' as const,
                    numeric: true,
                    cell: (variant: InventoryVariant) => formatMoney(variant.stock * variant.costPrice),
                  },
                ] as const)
              : []),
            {
              header: 'Days of Cover',
              align: 'end',
              numeric: true,
              cell: (variant) =>
                variant.salesStat?.daysOfCover !== undefined && variant.salesStat?.daysOfCover !== null
                  ? Math.round(variant.salesStat.daysOfCover)
                  : '—',
              muted: true,
            },
            {
              header: 'Last Sold',
              cell: (variant) => (variant.salesStat?.lastSoldAt ? formatDate(variant.salesStat.lastSoldAt) : '—'),
              muted: true,
            },
            {
              header: 'Actions',
              align: 'end',
              cell: (variant) => (
                <div className="whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleHistory(variant.id)}
                    className="text-accent-hover hover:underline"
                  >
                    {openHistoryId === variant.id ? 'Hide ledger' : 'Ledger'}
                  </button>
                  {canViewChain ? (
                    <Link href={`/admin/inventory/${variant.id}/chain`} className="ml-3 text-accent-hover hover:underline">
                      Chain
                    </Link>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
