'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import { formatMoney } from '@newax/shared';
import { DataTable, Tabs } from '@/components/ui';
import { ToastStack } from '@/components/admin/toast-stack';
import { useToast } from '@/hooks/use-toast';
import type { MarkdownSuggestion } from '@/types/api';

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
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Slow Movers</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Stock that has stopped selling, and what to do about it.
      </p>

      <Tabs
        label="Slow movers sections"
        items={[
          { key: 'variants', label: 'Slow movers', content: <SlowMoversTable /> },
          { key: 'markdowns', label: 'Markdown suggestions', content: <MarkdownSuggestionsQueue /> },
        ]}
      />
    </>
  );
}

function SlowMoversTable() {
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

function nameFor(suggestion: MarkdownSuggestion): string {
  return suggestion.variant.product.translations[0]?.name ?? suggestion.variant.product.slug;
}

/**
 * WO-9.8 (09-ai-layer.md) — the review queue MarkdownSuggestionsCron (via
 * InventoryCron's own nightly pass) fills for ageing stock. Every row is a
 * draft; "Create discount" is the only thing that ever activates one, and it
 * marks down the WHOLE product (the promotions engine has no per-variant
 * scope today) — said plainly here rather than implying a precision the
 * discount itself cannot deliver.
 */
function MarkdownSuggestionsQueue() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [suggestions, setSuggestions] = useState<MarkdownSuggestion[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setSuggestions(await adminFetch<MarkdownSuggestion[]>('/admin/inventory/markdown-suggestions'));
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not load markdown suggestions', 'error');
    } finally {
      setBusy(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function activate(id: string) {
    setActingOn(id);
    try {
      await adminFetch(`/admin/inventory/markdown-suggestions/${id}/activate`, { method: 'POST' });
      addToast('Discount created — the product is now marked down.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not create that discount', 'error');
    } finally {
      setActingOn(null);
    }
  }

  async function dismiss(id: string) {
    setActingOn(id);
    try {
      await adminFetch(`/admin/inventory/markdown-suggestions/${id}/dismiss`, { method: 'POST' });
      addToast('Dismissed', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not dismiss that suggestion', 'error');
    } finally {
      setActingOn(null);
    }
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <p className="mb-4 text-sm text-neutral-900/60">
        Every figure below is an estimate — the clearance percentage assumes a shop-tunable relationship
        between discount depth and sell-through speed (Settings → Inventory), not an observed fact.
        Creating a discount marks down the whole product, every size, not just this one.
      </p>

      <DataTable
        rows={suggestions}
        loading={busy && !suggestions}
        emptyLabel="Nothing waiting on you — no ageing stock has a pending suggestion right now."
        rowKey={(suggestion) => suggestion.id}
        columns={[
          {
            header: 'Product',
            cell: (suggestion) => (
              <>
                <div className="font-medium text-neutral-900">{nameFor(suggestion)}</div>
                <div className="text-xs text-neutral-900/60">
                  {suggestion.variant.sku}
                  {[suggestion.variant.size, suggestion.variant.color].filter(Boolean).length > 0
                    ? ` · ${[suggestion.variant.size, suggestion.variant.color].filter(Boolean).join(' / ')}`
                    : ''}
                </div>
              </>
            ),
          },
          {
            header: 'Suggested markdown',
            align: 'end',
            numeric: true,
            cell: (suggestion) => `${(suggestion.suggestedBps / 100).toFixed(0)}% off`,
            className: 'font-medium',
          },
          {
            header: 'Est. clearance (30d)',
            align: 'end',
            numeric: true,
            cell: (suggestion) => `${suggestion.estimatedClearancePct.toFixed(0)}%`,
            className: 'text-neutral-900/70',
          },
          {
            header: 'Est. days to clear',
            align: 'end',
            numeric: true,
            cell: (suggestion) => suggestion.estimatedClearanceDays,
            className: 'text-neutral-900/70',
          },
          {
            header: 'Margin/unit',
            align: 'end',
            numeric: true,
            cell: (suggestion) => (
              <>
                <span className="text-neutral-900/60 line-through">{formatMoney(suggestion.marginBeforePaisa)}</span>
                {' → '}
                <span className={cn('font-medium', suggestion.marginAfterPaisa < 0 ? 'text-red-600' : 'text-neutral-900')}>
                  {formatMoney(suggestion.marginAfterPaisa)}
                </span>
              </>
            ),
          },
          {
            header: '',
            cell: (suggestion) => (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-text"
                  disabled={actingOn === suggestion.id}
                  onClick={() => void activate(suggestion.id)}
                >
                  Create discount
                </button>
                <button
                  type="button"
                  className="btn-text text-feedback-negative"
                  disabled={actingOn === suggestion.id}
                  onClick={() => void dismiss(suggestion.id)}
                >
                  Dismiss
                </button>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
