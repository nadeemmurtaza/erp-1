'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@newax/shared';
import {
  getOrder,
  refundPayment,
  returnOrder,
  searchOrders,
  type AdminOrderDetail,
  type AdminOrderSummary,
} from '@/lib/pos-client';
import { ApiError } from '@/lib/api-client';
import { ROUTES } from '@/constants/routes';

type Screen = 'search' | 'confirm' | 'done';

/**
 * Returns and exchange (WO-21.5) — reuses the EXISTING admin order-status
 * and payment-refund endpoints rather than a new pos-specific one:
 * `orders.manage` moves the order to RETURNED (releasing stock at the order's
 * own location, R21.5's own fix to changeStatus()), `payments.approve` marks
 * the cash payment refunded. STAFF already holds both by default.
 *
 * An exchange is this same return, then a new sale rung up on the till
 * screen — no separate atomic "exchange" model.
 */
export default function ReturnsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminOrderSummary[]>([]);
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [note, setNote] = useState('');
  const [screen, setScreen] = useState<Screen>('search');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await searchOrders(query);
      setResults(res.data);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Search failed');
    }
  }

  async function select(summary: AdminOrderSummary) {
    setError(null);
    try {
      const detail = await getOrder(summary.id);
      setOrder(detail);
      setScreen('confirm');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the order');
    }
  }

  async function confirmReturn() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await returnOrder(order.id, note || undefined);

      const paidPayment = order.payments.find((p) => p.status === 'PAID');
      if (paidPayment) {
        await refundPayment(paidPayment.id, undefined, note || undefined);
      }

      setScreen('done');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not process the return');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setOrder(null);
    setResults([]);
    setQuery('');
    setNote('');
    setError(null);
    setScreen('search');
  }

  if (screen === 'done') {
    return (
      <main className="mx-auto max-w-sm p-6 text-center">
        <h1 className="mb-2 text-2xl font-semibold text-neutral-900">Return processed</h1>
        <p className="text-neutral-500">{order?.number} — stock and payment reversed.</p>
        <button className="tap-btn mt-6" onClick={reset}>
          Another return
        </button>
        <button className="tap-btn-secondary mt-3" onClick={() => router.push(ROUTES.till)}>
          Back to till
        </button>
      </main>
    );
  }

  if (screen === 'confirm' && order) {
    return (
      <main className="mx-auto max-w-sm p-6">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">{order.number}</h1>

        <div className="mb-4 divide-y divide-neutral-100 rounded-lg border border-neutral-100 bg-white">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between px-4 py-3">
              <span>
                {item.nameEn} × {item.quantity}
              </span>
              <span className="font-medium">{formatMoney(item.lineTotal)}</span>
            </div>
          ))}
        </div>

        <div className="mb-4 flex justify-between text-lg font-semibold text-neutral-900">
          <span>Total</span>
          <span>{formatMoney(order.grandTotal)}</span>
        </div>

        <textarea
          className="field-input mb-4"
          placeholder="Reason (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />

        {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-red-700">{error}</p>}

        <button className="tap-btn" onClick={confirmReturn} disabled={busy}>
          {busy ? 'Processing…' : `Return and refund ${formatMoney(order.grandTotal)}`}
        </button>
        <button className="tap-btn-secondary mt-3" onClick={reset} disabled={busy}>
          Cancel
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Returns</h1>

      <form onSubmit={search} className="mb-4 flex gap-2">
        <input
          className="field-input"
          placeholder="Order number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="tap-btn-secondary w-auto px-6">
          Find
        </button>
      </form>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-red-700">{error}</p>}

      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-100 bg-white">
        {results.map((r) => (
          <li key={r.id}>
            <button className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-neutral-50" onClick={() => select(r)}>
              <span>
                <span className="block font-medium text-neutral-900">{r.number}</span>
                <span className="block text-sm text-neutral-500">{r.status}</span>
              </span>
              <span className="font-semibold text-neutral-900">{formatMoney(r.grandTotal)}</span>
            </button>
          </li>
        ))}
      </ul>

      <button className="tap-btn-secondary mt-6" onClick={() => router.push(ROUTES.till)}>
        Back to till
      </button>
    </main>
  );
}
