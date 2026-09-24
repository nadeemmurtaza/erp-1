'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import { formatMoney } from '@newax/shared';
import { DataTable } from '@/components/ui';

interface InventoryVariant {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  stock: number;
  costPrice: number;
  salesStat: {
    daysOfCover: number | null;
    lastSoldAt: string | null;
    ageDays: number | null;
  } | null;
  product: { id: string; name: string };
}

export default function SlowMoversPage() {
  const { can } = useAdminSession();
  const canViewCost = can('inventory.view_cost');

  const [variants, setVariants] = useState<InventoryVariant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  // Ageing bucket filter
  const [minAge, setMinAge] = useState<number>(0);

  useEffect(() => {
    adminFetch<InventoryVariant[]>('/admin/inventory/slow-movers')
      .then((res) => {
        setVariants(res || []);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load slow movers'))
      .finally(() => setBusy(false));
  }, []);

  const filtered = variants?.filter(v => (v.salesStat?.ageDays || 0) >= minAge) || [];

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Slow Movers</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Variants with zero sales in the slow mover window.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-4">
        <span id="ageing-bucket-label" className="text-sm font-medium text-neutral-900/70">
          Ageing bucket:
        </span>
        <div role="group" aria-labelledby="ageing-bucket-label" className="flex flex-wrap gap-2">
          {[0, 60, 90, 180, 365].map((age) => (
            <button
              key={age}
              onClick={() => setMinAge(age)}
              className={cn(
                'px-3 py-1 rounded text-sm',
                minAge === age ? 'bg-neutral-100 text-accent-hover font-medium' : 'bg-white text-neutral-900/70 hover:bg-neutral-100'
              )}
            >
              {age === 0 ? 'All' : `> ${age} days`}
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
        <DataTable
          rows={filtered}
          loading={busy && !variants}
          emptyLabel="No slow movers found for this bucket."
          rowKey={(variant) => variant.id}
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
            { header: 'SKU', cell: (variant) => variant.sku, className: 'text-neutral-900/80' },
            {
              header: 'Stock',
              align: 'end',
              numeric: true,
              cell: (variant) => variant.stock,
              className: 'font-medium',
            },
            {
              header: 'Days of Cover',
              align: 'end',
              numeric: true,
              cell: (variant) =>
                variant.salesStat?.daysOfCover !== undefined && variant.salesStat?.daysOfCover !== null
                  ? Math.round(variant.salesStat.daysOfCover)
                  : '—',
              className: 'text-neutral-900/60',
            },
            {
              header: 'Age (Days)',
              align: 'end',
              numeric: true,
              cell: (variant) => variant.salesStat?.ageDays ?? '—',
              className: 'text-amber-600 font-medium',
            },
            ...(canViewCost
              ? [
                  {
                    header: 'Value at Risk',
                    align: 'end' as const,
                    numeric: true,
                    cell: (variant: InventoryVariant) => formatMoney(variant.stock * variant.costPrice),
                    className: 'font-medium text-red-600',
                  },
                ]
              : []),
          ]}
        />
      </div>
    </>
  );
}
