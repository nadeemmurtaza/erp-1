'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { closeShift, zReport, type ZReport } from '@/lib/pos-client';
import { ApiError } from '@/lib/api-client';
import { STORAGE_KEYS } from '@/constants/storage';
import { ROUTES } from '@/constants/routes';
import { formatMoney } from '@newax/shared';

export default function CloseShiftPage() {
  const router = useRouter();
  const [countRupees, setCountRupees] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ZReport | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const shiftId = localStorage.getItem(STORAGE_KEYS.shiftId);
    if (!shiftId) {
      router.replace(ROUTES.till);
      return;
    }

    const closingCashMinor = Math.round(Number(countRupees) * 100);
    if (!Number.isFinite(closingCashMinor) || closingCashMinor < 0) {
      setError('Enter a valid cash count.');
      return;
    }

    setBusy(true);
    try {
      await closeShift(shiftId, closingCashMinor);
      setReport(await zReport(shiftId));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not close the shift');
    } finally {
      setBusy(false);
    }
  }

  function done() {
    localStorage.removeItem(STORAGE_KEYS.shiftId);
    router.replace(ROUTES.openShift);
  }

  if (report) {
    return (
      <main className="mx-auto max-w-sm p-6">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Shift closed</h1>
        <dl className="space-y-2 text-lg">
          <Row label="Expected" value={report.expectedCashMinor} />
          <Row label="Counted" value={report.closingCashMinor} />
          <Row
            label={report.overShortMinor === 0 ? 'Balanced' : report.overShortMinor > 0 ? 'Over' : 'Short'}
            value={Math.abs(report.overShortMinor)}
            emphasis
          />
        </dl>
        <button className="tap-btn mt-6" onClick={done}>
          Done
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="text-center text-2xl font-semibold text-neutral-900">Close shift</h1>
        <p className="text-center text-neutral-500">Count the drawer and enter what’s physically there.</p>

        <input
          className="field-input text-center"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="Cash counted (Rs)"
          value={countRupees}
          onChange={(e) => setCountRupees(e.target.value)}
          required
        />

        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-center text-red-700">{error}</p>}

        <button type="submit" className="tap-btn" disabled={busy}>
          {busy ? 'Closing…' : 'Close shift'}
        </button>
      </form>
    </main>
  );
}

function Row({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={emphasis ? 'font-semibold text-neutral-900' : 'text-neutral-900'}>{formatMoney(value)}</dd>
    </div>
  );
}
