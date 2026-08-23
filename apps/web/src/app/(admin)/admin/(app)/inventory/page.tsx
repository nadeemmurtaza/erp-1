'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { adminFetch } from '@/lib/admin-client';

interface InventoryVariant {
  id: string;
  sku: string;
  size: string;
  color: string;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
  product: { id: string; name: string };
}

interface StockAdjustmentRow {
  id: string;
  delta: number;
  resultingStock: number;
  reason: string;
  note: string | null;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
}

/** Mirrors InventoryService's STOCK_ADJUSTMENT_REASONS — kept as a fixed list here too. */
const REASONS: Array<{ value: string; label: string }> = [
  { value: 'restock', label: 'Restock' },
  { value: 'correction', label: 'Correction' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'sold_offline', label: 'Sold offline' },
  { value: 'other', label: 'Other' },
];
const REASON_LABELS = Object.fromEntries(REASONS.map((reason) => [reason.value, reason.label]));

/**
 * Stock on hand, with an "Adjust" form and an audit trail per variant.
 *
 * Adjust and History expand inline below the row that owns them rather than in
 * a modal — this admin has no modal component, and a table this narrow doesn't
 * need one.
 */
export default function AdminInventoryPage() {
  const [variants, setVariants] = useState<InventoryVariant[] | null>(null);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const [openAdjustId, setOpenAdjustId] = useState<string | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState(REASONS[0].value);
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);

  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<StockAdjustmentRow[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setVariants(
        await adminFetch<InventoryVariant[]>('/admin/inventory', {
          query: { search: search || undefined, lowStockOnly: lowStockOnly || undefined },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load inventory');
    } finally {
      setBusy(false);
    }
  }, [search, lowStockOnly]);

  useEffect(() => {
    // Debounced so typing in the search box does not fire a request per keystroke.
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  function toggleAdjust(variantId: string): void {
    setOpenHistoryId(null);
    setNotice(null);
    setError(null);
    if (openAdjustId === variantId) {
      setOpenAdjustId(null);
      return;
    }
    setOpenAdjustId(variantId);
    setAdjustDelta('');
    setAdjustReason(REASONS[0].value);
    setAdjustNote('');
  }

  async function toggleHistory(variantId: string): Promise<void> {
    setOpenAdjustId(null);
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
        await adminFetch<StockAdjustmentRow[]>(`/admin/inventory/${variantId}/history`),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load history');
    } finally {
      setHistoryBusy(false);
    }
  }

  async function submitAdjust(event: React.FormEvent, variant: InventoryVariant): Promise<void> {
    event.preventDefault();
    const delta = Number(adjustDelta);
    if (!Number.isInteger(delta) || delta === 0) {
      setError('Enter a whole number that is not zero.');
      return;
    }

    setError(null);
    setNotice(null);
    setAdjustBusy(true);
    try {
      const result = await adminFetch<{ variant: { stock: number } }>(
        `/admin/inventory/${variant.id}/adjust`,
        { method: 'POST', body: { delta, reason: adjustReason, note: adjustNote.trim() || undefined } },
      );

      setVariants(
        (current) =>
          current?.map((row) =>
            row.id === variant.id ? { ...row, stock: result.variant.stock } : row,
          ) ?? current,
      );
      setNotice(`${variant.sku} is now ${result.variant.stock} in stock.`);
      setOpenAdjustId(null);
      // The history panel, if it was ever opened for this row, is now stale.
      if (openHistoryId === variant.id) setOpenHistoryId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not adjust stock');
    } finally {
      setAdjustBusy(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Inventory</h1>
      <p className="mb-6 text-sm text-ink/60">
        Stock on hand, with a record of every adjustment and who made it.
      </p>

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <input
          type="search"
          placeholder="Search SKU or product"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="field-input max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(event) => setLowStockOnly(event.target.checked)}
            className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
          />
          Low stock only
        </label>
      </div>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? <p className="card mb-4 p-4 text-sm text-brand-800">{notice}</p> : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-sand-200 bg-sand-50">
              <tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th>Size / colour</Th>
                <Th className="text-end">Stock</Th>
                <Th className="text-end">Low-stock at</Th>
                <Th className="text-end">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {busy && !variants ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink/50">
                    Loading…
                  </td>
                </tr>
              ) : variants && variants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink/50">
                    No variants match those filters.
                  </td>
                </tr>
              ) : (
                variants?.map((variant) => {
                  const isLow = variant.stock <= variant.lowStockThreshold;
                  const adjustOpen = openAdjustId === variant.id;
                  const historyOpen = openHistoryId === variant.id;

                  return (
                    <Fragment key={variant.id}>
                      <tr className={isLow ? 'bg-gold/10 hover:bg-gold/20' : 'hover:bg-sand-50'}>
                        <td className="px-4 py-3 font-medium text-ink">{variant.sku}</td>
                        <td className="px-4 py-3 text-ink/70">{variant.product.name}</td>
                        <td className="px-4 py-3 text-ink/70">
                          {variant.size} / {variant.color}
                        </td>
                        <td
                          className={clsx(
                            'px-4 py-3 text-end tabular-nums',
                            variant.stock === 0
                              ? 'font-medium text-red-700'
                              : isLow
                                ? 'font-medium text-gold'
                                : 'text-ink',
                          )}
                        >
                          {variant.stock}
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums text-ink/50">
                          {variant.lowStockThreshold}
                        </td>
                        <td className="px-4 py-3 text-end">
                          <div className="flex justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => toggleAdjust(variant.id)}
                              className="text-xs font-medium text-brand-700 hover:underline"
                            >
                              {adjustOpen ? 'Cancel' : 'Adjust'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleHistory(variant.id)}
                              className="text-xs font-medium text-brand-700 hover:underline"
                            >
                              {historyOpen ? 'Hide history' : 'History'}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {adjustOpen ? (
                        <tr className="bg-sand-50">
                          <td colSpan={6} className="px-4 py-4">
                            <form
                              onSubmit={(event) => void submitAdjust(event, variant)}
                              className="flex flex-wrap items-end gap-3"
                            >
                              <label className="block">
                                <span className="field-label">Change</span>
                                <input
                                  type="number"
                                  step="1"
                                  value={adjustDelta}
                                  onChange={(event) => setAdjustDelta(event.target.value)}
                                  placeholder="e.g. 10 or -3"
                                  className="field-input w-32"
                                  required
                                />
                              </label>
                              <label className="block">
                                <span className="field-label">Reason</span>
                                <select
                                  value={adjustReason}
                                  onChange={(event) => setAdjustReason(event.target.value)}
                                  className="field-input w-auto"
                                >
                                  {REASONS.map((reason) => (
                                    <option key={reason.value} value={reason.value}>
                                      {reason.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="block min-w-[12rem] flex-1">
                                <span className="field-label">Note (optional)</span>
                                <input
                                  value={adjustNote}
                                  onChange={(event) => setAdjustNote(event.target.value)}
                                  className="field-input"
                                  maxLength={500}
                                />
                              </label>
                              <button type="submit" disabled={adjustBusy} className="btn-primary">
                                {adjustBusy ? 'Saving…' : 'Save'}
                              </button>
                            </form>
                            <p className="mt-2 text-xs text-ink/50">
                              Currently {variant.stock} in stock. A negative change can&apos;t
                              take it below zero.
                            </p>
                          </td>
                        </tr>
                      ) : null}

                      {historyOpen ? (
                        <tr className="bg-sand-50">
                          <td colSpan={6} className="px-4 py-4">
                            {historyBusy ? (
                              <p className="text-sm text-ink/50">Loading…</p>
                            ) : !historyRows || historyRows.length === 0 ? (
                              <p className="text-sm text-ink/50">No adjustments recorded yet.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr>
                                      <th className="py-1 text-start font-medium text-ink/50">
                                        Date
                                      </th>
                                      <th className="py-1 text-start font-medium text-ink/50">
                                        Change
                                      </th>
                                      <th className="py-1 text-start font-medium text-ink/50">
                                        Resulting stock
                                      </th>
                                      <th className="py-1 text-start font-medium text-ink/50">
                                        Reason
                                      </th>
                                      <th className="py-1 text-start font-medium text-ink/50">
                                        By
                                      </th>
                                      <th className="py-1 text-start font-medium text-ink/50">
                                        Note
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-sand-200">
                                    {historyRows.map((row) => (
                                      <tr key={row.id}>
                                        <td className="py-1.5 text-ink/70">
                                          {new Date(row.createdAt).toLocaleString('en-PK')}
                                        </td>
                                        <td
                                          className={clsx(
                                            'py-1.5 tabular-nums font-medium',
                                            row.delta > 0 ? 'text-brand-700' : 'text-red-700',
                                          )}
                                        >
                                          {row.delta > 0 ? `+${row.delta}` : row.delta}
                                        </td>
                                        <td className="py-1.5 tabular-nums text-ink">
                                          {row.resultingStock}
                                        </td>
                                        <td className="py-1.5 text-ink/70">
                                          {REASON_LABELS[row.reason] ?? row.reason}
                                        </td>
                                        <td className="py-1.5 text-ink/70">
                                          {row.actorName ?? '—'}
                                        </td>
                                        <td className="py-1.5 text-ink/50">{row.note ?? '—'}</td>
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={clsx(
        'px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-ink/50',
        className,
      )}
    >
      {children}
    </th>
  );
}
