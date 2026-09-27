'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addLine,
  basketTotals,
  clearBasket,
  computeTender,
  createOutboxEntry,
  removeLine,
  setQuantity,
  type Basket,
} from '@newax/pos-core';
import { formatMoney } from '@newax/shared';
import { searchProducts, sell, type PosInstalmentPlanRequest, type PosSaleRequest, type PosVariant } from '@/lib/pos-client';
import { ApiError } from '@/lib/api-client';
import { putOutboxEntry, listOutboxEntries } from '@/lib/outbox-db';
import { syncOutbox } from '@/lib/outbox-sync';
import { STORAGE_KEYS } from '@/constants/storage';
import { ROUTES } from '@/constants/routes';

type Screen = 'basket' | 'tender' | 'done';
type SaleType = 'CASH' | 'LAYBY' | 'INSTALMENT';

/**
 * finance-accounting/151-layby-installment-sales.md WO-151.5 — an equal
 * split of what remains after the deposit, one line per month, the
 * remainder folded into the last line so the sum always matches the order
 * total exactly (the backend refuses anything that does not).
 */
function buildInstalmentSchedule(remainingMinor: number, count: number): { dueDate: string; amountMinor: number }[] {
  const base = Math.floor(remainingMinor / count);
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const dueDate = new Date(now.getFullYear(), now.getMonth() + i + 1, now.getDate()).toISOString();
    const amountMinor = i === count - 1 ? remainingMinor - base * (count - 1) : base;
    return { dueDate, amountMinor };
  });
}

export default function TillPage() {
  const router = useRouter();
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);

  const [basket, setBasket] = useState<Basket>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PosVariant[]>([]);
  const [screen, setScreen] = useState<Screen>('basket');
  const [tenderRupees, setTenderRupees] = useState('');
  const [saleType, setSaleType] = useState<SaleType>('CASH');
  const [depositRupees, setDepositRupees] = useState('');
  const [instalmentsCount, setInstalmentsCount] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{
    queued: boolean;
    orderId?: string;
    orderNumber?: string;
    changeMinor: number;
    isLayby: boolean;
  } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const t = localStorage.getItem(STORAGE_KEYS.terminalId);
    const s = localStorage.getItem(STORAGE_KEYS.shiftId);
    if (!t) return void router.replace(ROUTES.selectTerminal);
    if (!s) return void router.replace(ROUTES.openShift);
    setTerminalId(t);
    setShiftId(s);
  }, [router]);

  useEffect(() => {
    void refreshPendingCount();
  }, []);

  async function refreshPendingCount() {
    const entries = await listOutboxEntries();
    setPendingCount(entries.filter((e) => e.status === 'PENDING' || e.status === 'FAILED').length);
  }

  useEffect(() => {
    if (!terminalId || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      searchProducts(terminalId, query)
        .then((res) => setResults(res.data))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, terminalId]);

  const totals = useMemo(() => basketTotals(basket), [basket]);
  const tenderedMinor = Math.round((Number(tenderRupees) || 0) * 100);
  const tender = computeTender(totals.grandTotal, tenderedMinor);

  const depositMinor = Math.round((Number(depositRupees) || 0) * 100);
  const instalmentCountNum = Math.max(1, parseInt(instalmentsCount, 10) || 1);
  const remainingAfterDepositMinor = totals.grandTotal - depositMinor;
  const depositValid = saleType === 'CASH' || (depositMinor >= 0 && depositMinor <= totals.grandTotal);
  const canComplete = saleType === 'CASH' ? tender.sufficient : depositValid;

  function addToBasket(variant: PosVariant) {
    setBasket((b) => addLine(b, { variantId: variant.variantId, sku: variant.sku, nameEn: variant.nameEn, unitPrice: variant.unitPrice }));
    setQuery('');
    setResults([]);
  }

  async function completeSale() {
    if (!shiftId || basket.length === 0) return;
    setError(null);
    setBusy(true);

    const instalmentPlan: PosInstalmentPlanRequest | undefined =
      saleType === 'CASH'
        ? undefined
        : {
            type: saleType,
            depositMinor,
            schedule: buildInstalmentSchedule(remainingAfterDepositMinor, instalmentCountNum),
          };

    const payload: PosSaleRequest = {
      lines: basket.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      instalmentPlan,
    };

    // architecture-patterns/157 — generated BEFORE the attempt, not after a
    // failure: if this exact call reaches the server and creates the order
    // but the response is lost (the timeout case below), the outbox retry
    // must resend the SAME key so it replays that order instead of ringing
    // up a second one.
    const idempotencyKey = crypto.randomUUID();

    try {
      const order = await sell(shiftId, payload, idempotencyKey);
      setLastResult({
        queued: false,
        orderId: order.id,
        orderNumber: order.number,
        changeMinor: saleType === 'CASH' ? tender.changeMinor : 0,
        isLayby: order.status === 'PENDING',
      });
      setBasket(clearBasket());
      setScreen('done');
    } catch (cause) {
      // A genuine network failure (offline, DNS, timeout) has no ApiError
      // status — that's R5's own case: the till already promised this sale
      // to the customer, so it queues rather than failing the screen. A
      // real API error (validation, permission) surfaces instead, since
      // retrying it would just fail the same way again.
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        await putOutboxEntry(createOutboxEntry(idempotencyKey, payload));
        await refreshPendingCount();
        setLastResult({ queued: true, changeMinor: saleType === 'CASH' ? tender.changeMinor : 0, isLayby: saleType === 'LAYBY' });
        setBasket(clearBasket());
        setScreen('done');
      }
    } finally {
      setBusy(false);
    }
  }

  async function retrySync() {
    if (!shiftId) return;
    setBusy(true);
    await syncOutbox(shiftId).catch(() => undefined);
    await refreshPendingCount();
    setBusy(false);
  }

  function newSale() {
    setLastResult(null);
    setTenderRupees('');
    setSaleType('CASH');
    setDepositRupees('');
    setInstalmentsCount('1');
    setScreen('basket');
  }

  if (screen === 'done' && lastResult) {
    return (
      <main className="mx-auto max-w-sm p-6 text-center">
        <h1 className="mb-2 text-2xl font-semibold text-neutral-900">
          {lastResult.queued ? 'Sale saved — will sync' : lastResult.isLayby ? 'Layby started — goods on hold' : 'Sale complete'}
        </h1>
        {lastResult.orderNumber && <p className="text-neutral-500">{lastResult.orderNumber}</p>}
        {lastResult.queued && (
          <p className="mt-2 rounded-lg bg-amber-50 px-4 py-3 text-amber-800">
            No connection — this sale is queued and will sync automatically the next time this till is online.
          </p>
        )}
        {!lastResult.queued && lastResult.isLayby && (
          <p className="mt-2 rounded-lg bg-amber-50 px-4 py-3 text-amber-800">
            Stock is not held — record each instalment from the order&apos;s own page, and hand over the goods once
            it&apos;s paid in full.
          </p>
        )}
        {lastResult.changeMinor > 0 && (
          <p className="mt-4 text-xl font-semibold text-neutral-900">Change due: {formatMoney(lastResult.changeMinor)}</p>
        )}
        {lastResult.orderId && (
          <button className="tap-btn-secondary mt-6" onClick={() => router.push(`/receipt/${lastResult.orderId}`)}>
            Print receipt
          </button>
        )}
        <button className="tap-btn mt-3" onClick={newSale}>
          New sale
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Till</h1>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button
              className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800"
              onClick={retrySync}
              disabled={busy}
            >
              {pendingCount} pending — retry
            </button>
          )}
          <button className="text-sm text-neutral-500 underline" onClick={() => router.push(ROUTES.returns)}>
            Returns
          </button>
          <button className="text-sm text-neutral-500 underline" onClick={() => router.push(ROUTES.closeShift)}>
            Close shift
          </button>
        </div>
      </header>

      {screen === 'basket' && (
        <>
          <input
            className="field-input mb-3"
            placeholder="Search SKU, barcode or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {results.length > 0 && (
            <ul className="mb-4 divide-y divide-neutral-100 rounded-lg border border-neutral-100 bg-white">
              {results.map((variant) => (
                <li key={variant.variantId}>
                  <button className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-neutral-50" onClick={() => addToBasket(variant)}>
                    <span>
                      <span className="block font-medium text-neutral-900">{variant.nameEn}</span>
                      <span className="block text-sm text-neutral-500">
                        {variant.sku} · {variant.stock} in stock
                      </span>
                    </span>
                    <span className="font-semibold text-neutral-900">{formatMoney(variant.unitPrice)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex-1 overflow-y-auto">
            {basket.length === 0 && <p className="text-center text-neutral-400">Basket is empty</p>}
            {basket.map((line) => (
              <div key={line.variantId} className="basket-row">
                <div>
                  <p className="font-medium text-neutral-900">{line.nameEn}</p>
                  <p className="text-sm text-neutral-500">{formatMoney(line.unitPrice)} each</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    className="keypad-key h-10 w-10 text-base"
                    onClick={() => setBasket((b) => setQuantity(b, line.variantId, line.quantity - 1))}
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-semibold">{line.quantity}</span>
                  <button
                    className="keypad-key h-10 w-10 text-base"
                    onClick={() => setBasket((b) => addLine(b, line, 1))}
                  >
                    +
                  </button>
                  <button className="text-sm text-red-600" onClick={() => setBasket((b) => removeLine(b, line.variantId))}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-neutral-100 pt-4">
            <div className="mb-3 flex justify-between text-xl font-semibold text-neutral-900">
              <span>Total</span>
              <span>{formatMoney(totals.grandTotal)}</span>
            </div>
            <button className="tap-btn" disabled={basket.length === 0} onClick={() => setScreen('tender')}>
              Charge {formatMoney(totals.grandTotal)}
            </button>
          </div>
        </>
      )}

      {screen === 'tender' && (
        <div className="flex flex-1 flex-col justify-center space-y-4">
          <p className="text-center text-neutral-500">Total due</p>
          <p className="text-center text-4xl font-semibold text-neutral-900">{formatMoney(totals.grandTotal)}</p>

          {/* finance-accounting/151-layby-installment-sales.md WO-151.5 */}
          <div className="flex justify-center gap-1 rounded-lg border border-neutral-200 p-1" role="group" aria-label="Sale type">
            {(['CASH', 'LAYBY', 'INSTALMENT'] as const).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={saleType === type}
                className={saleType === type ? 'tap-btn flex-1 !py-2 text-sm' : 'tap-btn-secondary flex-1 !py-2 text-sm'}
                onClick={() => setSaleType(type)}
              >
                {type === 'CASH' ? 'Cash' : type === 'LAYBY' ? 'Layby' : 'Instalment'}
              </button>
            ))}
          </div>

          {saleType === 'CASH' ? (
            <>
              <input
                className="field-input text-center text-2xl"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Cash tendered (Rs)"
                value={tenderRupees}
                onChange={(e) => setTenderRupees(e.target.value)}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the tender field appears when the operator opens payment, with a customer waiting. Typing the amount is the next action every time.
                autoFocus
              />
              {tenderedMinor > 0 && (
                <p className="text-center text-lg text-neutral-700">
                  {tender.sufficient
                    ? `Change: ${formatMoney(tender.changeMinor)}`
                    : `Still due: ${formatMoney(tender.amountDueMinor)}`}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-center text-sm text-neutral-500">
                {saleType === 'LAYBY'
                  ? 'Goods stay on hold until paid in full.'
                  : 'Goods go home today; the rest is collected over time.'}
              </p>
              <input
                className="field-input text-center text-2xl"
                type="number"
                inputMode="decimal"
                min="0"
                max={totals.grandTotal / 100}
                step="0.01"
                placeholder="Deposit (Rs)"
                value={depositRupees}
                onChange={(e) => setDepositRupees(e.target.value)}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- see the CASH field's own note above; same moment, same reason.
                autoFocus
              />
              <div className="flex items-center justify-center gap-3">
                <label htmlFor="instalments-count" className="text-sm text-neutral-500">
                  Months to pay
                </label>
                <input
                  id="instalments-count"
                  className="field-input w-20 text-center"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={instalmentsCount}
                  onChange={(e) => setInstalmentsCount(e.target.value)}
                />
              </div>
              {depositValid && (
                <p className="text-center text-sm text-neutral-700">
                  Collect {formatMoney(depositMinor)} now, then {formatMoney(Math.floor(remainingAfterDepositMinor / instalmentCountNum))}
                  /month for {instalmentCountNum} month{instalmentCountNum === 1 ? '' : 's'}.
                </p>
              )}
              {!depositValid && (
                <p className="text-center text-sm text-red-600">Deposit cannot exceed the total.</p>
              )}
            </>
          )}

          {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-center text-red-700">{error}</p>}

          <button className="tap-btn" disabled={!canComplete || busy} onClick={completeSale}>
            {busy ? 'Completing…' : saleType === 'CASH' ? 'Complete sale' : saleType === 'LAYBY' ? 'Start layby' : 'Start instalment plan'}
          </button>
          <button className="tap-btn-secondary" onClick={() => setScreen('basket')} disabled={busy}>
            Back
          </button>
        </div>
      )}
    </main>
  );
}
