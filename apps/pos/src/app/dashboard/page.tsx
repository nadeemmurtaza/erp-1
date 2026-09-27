'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@newax/shared';
import { getDashboardSummary, type PosDashboardSummary } from '@/lib/pos-client';
import { ApiError } from '@/lib/api-client';
import { STORAGE_KEYS } from '@/constants/storage';
import { ROUTES } from '@/constants/routes';

/**
 * pos-hardware/76-pos-mobile-dashboard.md WO-76.2 — a glance-view of the
 * till's own branch: today's sales, total customers, and low-stock
 * variants. Reuses AnalyticsService.summary()'s own figures via
 * PosDashboardService, scoped to this terminal's own locationId — never a
 * cross-branch rollup on a till (doc 76's own "Three silhouettes" lens).
 */
export default function PosDashboardPage() {
  const router = useRouter();
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [summary, setSummary] = useState<PosDashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((id: string) => {
    setLoading(true);
    setError(null);
    getDashboardSummary(id)
      .then(setSummary)
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Could not load the dashboard'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = localStorage.getItem(STORAGE_KEYS.terminalId);
    if (!t) return void router.replace(ROUTES.selectTerminal);
    setTerminalId(t);
    load(t);
  }, [router, load]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
        <button className="text-sm text-neutral-500 underline" onClick={() => router.push(ROUTES.till)}>
          Back to till
        </button>
      </header>

      {loading && <p className="text-center text-neutral-400">Loading…</p>}

      {!loading && error && (
        <div className="space-y-3 text-center">
          <p className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{error}</p>
          <button className="tap-btn-secondary" onClick={() => terminalId && load(terminalId)}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <p className="text-sm text-neutral-500">Today&apos;s sales</p>
              <p className="mt-1 text-2xl font-semibold text-neutral-900">{formatMoney(summary.dailySales.revenue)}</p>
              <p className="text-xs text-neutral-400">{summary.dailySales.orderCount} sale{summary.dailySales.orderCount === 1 ? '' : 's'}</p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <p className="text-sm text-neutral-500">Total customers</p>
              <p className="mt-1 text-2xl font-semibold text-neutral-900">{summary.totalCustomers}</p>
            </div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-medium text-neutral-700">Low stock</p>
            {summary.lowStockVariants.length === 0 ? (
              <p className="text-sm text-neutral-400">Nothing below its reorder point at this branch.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {summary.lowStockVariants.map((row) => (
                  <li key={row.variantId} className="flex items-center justify-between py-2">
                    <span>
                      <span className="block text-sm font-medium text-neutral-900">{row.productName}</span>
                      <span className="block text-xs text-neutral-500">
                        {row.variantLabel} · {row.sku}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-red-600">
                      {row.stock} / {row.reorderPoint}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
