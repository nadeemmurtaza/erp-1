'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import { formatMoney } from '@newax/shared';
import { Loading } from '@/components/ui';

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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-3 py-3 text-start font-medium text-neutral-900/70', className)}>
      {children}
    </th>
  );
}

export default function SlowMoversPage() {
  const user = getStoredUser();
  const canViewCost = user?.permissions.includes('inventory.view_cost');

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
        <label className="text-sm font-medium text-neutral-900/70">Ageing bucket:</label>
        <div className="flex gap-2">
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
        <div className="overflow-x-auto">
          <table className="table-flat">
            <thead className="whitespace-nowrap">
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th className="text-end">Stock</Th>
                <Th className="text-end">Days of Cover</Th>
                <Th className="text-end">Age (Days)</Th>
                {canViewCost && (
                  <Th className="text-end">Value at Risk</Th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {busy && !variants ? (
                <tr>
                  <td colSpan={canViewCost ? 6 : 5} className="p-8 text-center">
                    <Loading className="p-0" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={canViewCost ? 6 : 5} className="p-8 text-center text-neutral-900/50">
                    No slow movers found for this bucket.
                  </td>
                </tr>
              ) : (
                filtered.map((variant) => (
                  <tr key={variant.id} className="hover:bg-neutral-50/50">
                    <td>
                      <div className="font-medium text-neutral-900">{variant.product.name}</div>
                      <div className="text-xs text-neutral-900/60">
                        {[variant.size, variant.color].filter(Boolean).join(' / ')}
                      </div>
                    </td>
                    <td className="text-neutral-900/80">{variant.sku}</td>
                    <td className="text-end font-medium">
                      {variant.stock}
                    </td>
                    <td className="text-end text-neutral-900/60">
                      {variant.salesStat?.daysOfCover !== undefined && variant.salesStat?.daysOfCover !== null 
                        ? Math.round(variant.salesStat.daysOfCover)
                        : '—'}
                    </td>
                    <td className="text-end text-amber-600 font-medium">
                      {variant.salesStat?.ageDays ?? '—'}
                    </td>
                    {canViewCost && (
                      <td className="text-end font-medium text-red-600">
                        {formatMoney(variant.stock * variant.costPrice)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
