'use client';

import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import type { AdminProduct, PaginatedResponse, ProductCrossSellRow } from '@/types/api';

const KIND_LABELS: Record<ProductCrossSellRow['kind'], string> = {
  MANUAL: 'Manual pick',
  CO_OCCURRENCE: 'Frequently bought together',
  EMBEDDING: 'Similar product',
};

/**
 * WO-9.6 (09-ai-layer.md) — "always leave the manual override in place": a
 * merchandiser's own picks (MANUAL) are the only cross-sells this screen can
 * add, remove or reorder. CO_OCCURRENCE and EMBEDDING rows are written only
 * by RecommendationsCron and are shown here read-only, so staff can see —
 * and, if a pairing is wrong, override with a manual one — what the
 * storefront is actually showing without needing a second, algorithmic-only
 * screen.
 */
export function CrossSellManager({ productId }: { productId: string }) {
  const [rows, setRows] = useState<ProductCrossSellRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceHandle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    adminFetch<ProductCrossSellRow[]>(`/admin/catalog/products/${productId}/cross-sells`)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load cross-sells');
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    clearTimeout(debounceHandle.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceHandle.current = setTimeout(() => {
      setSearching(true);
      adminFetch<PaginatedResponse<AdminProduct>>('/admin/catalog/products', {
        query: { q: query.trim(), pageSize: 6 },
      })
        .then((page) => setResults(page.data))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(debounceHandle.current);
  }, [query]);

  const manual = (rows ?? []).filter((row) => row.kind === 'MANUAL').sort((a, b) => a.order - b.order);
  const algorithmic = (rows ?? []).filter((row) => row.kind !== 'MANUAL');
  const manualRelatedIds = new Set(manual.map((row) => row.relatedProduct.id));
  const searchableResults = results.filter((p) => p.id !== productId && !manualRelatedIds.has(p.id));

  async function add(relatedProductId: string) {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/catalog/products/${productId}/cross-sells`, {
        method: 'POST',
        body: { relatedProductId },
      });
      setRows(await adminFetch<ProductCrossSellRow[]>(`/admin/catalog/products/${productId}/cross-sells`));
      setQuery('');
      setResults([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this cross-sell');
    } finally {
      setBusy(false);
    }
  }

  async function remove(relatedProductId: string) {
    const previous = rows;
    setRows((current) => (current ?? []).filter((row) => row.relatedProduct.id !== relatedProductId));
    try {
      await adminFetch(`/admin/catalog/products/${productId}/cross-sells/${relatedProductId}`, {
        method: 'DELETE',
      });
    } catch (cause) {
      setRows(previous);
      setError(cause instanceof Error ? cause.message : 'Could not remove this cross-sell');
    }
  }

  async function persistOrder(nextManual: ProductCrossSellRow[]) {
    const previous = rows;
    setRows((current) => [
      ...nextManual.map((row, index) => ({ ...row, order: index })),
      ...(current ?? []).filter((row) => row.kind !== 'MANUAL'),
    ]);
    try {
      await adminFetch(`/admin/catalog/products/${productId}/cross-sells/order`, {
        method: 'PATCH',
        body: { relatedProductIds: nextManual.map((row) => row.relatedProduct.id) },
      });
    } catch (cause) {
      setRows(previous);
      setError(cause instanceof Error ? cause.message : 'Could not save the new order');
    }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= manual.length) return;
    const next = [...manual];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    void persistOrder(next);
  }

  if (rows === null) {
    return <p className="text-sm text-neutral-900/60">Loading…</p>;
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="notice notice-error mb-3">
          {error}
        </p>
      ) : null}

      {manual.length > 0 ? (
        <ul className="mb-4 divide-y divide-neutral-100">
          {manual.map((row, index) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm text-neutral-900">{row.relatedProduct.name}</p>
                <p className="text-xs text-neutral-900/60">{KIND_LABELS.MANUAL}</p>
              </div>
              <div className="flex items-center gap-1">
                <IconButton label="Move earlier" onClick={() => move(index, -1)} disabled={index === 0}>
                  ↑
                </IconButton>
                <IconButton
                  label="Move later"
                  onClick={() => move(index, 1)}
                  disabled={index === manual.length - 1}
                >
                  ↓
                </IconButton>
                <button
                  type="button"
                  onClick={() => void remove(row.relatedProduct.id)}
                  className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-neutral-900/60">
          No manual picks yet — the storefront shows an algorithmic pairing below instead, once one exists.
        </p>
      )}

      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products to pair manually…"
          className="field-input w-full"
          disabled={busy}
        />
        {query.trim().length >= 2 ? (
          <ul className="mt-2 divide-y divide-neutral-100 rounded border border-neutral-100">
            {searching ? (
              <li className="px-3 py-2 text-xs text-neutral-900/60">Searching…</li>
            ) : searchableResults.length > 0 ? (
              searchableResults.map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm text-neutral-900">
                    {product.translations.find((t) => t.locale === 'en')?.name ?? product.slug}
                  </span>
                  <button
                    type="button"
                    onClick={() => void add(product.id)}
                    disabled={busy}
                    className="btn-secondary px-2 py-1 text-xs"
                  >
                    Add
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-xs text-neutral-900/60">No matching products.</li>
            )}
          </ul>
        ) : null}
      </div>

      {algorithmic.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60">
            Shown automatically
          </h3>
          <p className="mt-1 text-xs text-neutral-900/60">
            Computed nightly from what customers buy and view together. Add a manual pick above to override any of
            these.
          </p>
          <ul className="mt-2 divide-y divide-neutral-100">
            {algorithmic.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-neutral-900">{row.relatedProduct.name}</span>
                <span className="text-xs text-neutral-900/60">{KIND_LABELS[row.kind]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded text-neutral-900/70 hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
