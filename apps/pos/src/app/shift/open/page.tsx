'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { openShift } from '@/lib/pos-client';
import { ApiError } from '@/lib/api-client';
import { STORAGE_KEYS } from '@/constants/storage';
import { ROUTES } from '@/constants/routes';

export default function OpenShiftPage() {
  const router = useRouter();
  const [floatRupees, setFloatRupees] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const terminalId = localStorage.getItem(STORAGE_KEYS.terminalId);
    if (!terminalId) {
      router.replace(ROUTES.selectTerminal);
      return;
    }

    const openingCashMinor = Math.round(Number(floatRupees) * 100);
    if (!Number.isFinite(openingCashMinor) || openingCashMinor < 0) {
      setError('Enter a valid opening float.');
      return;
    }

    setBusy(true);
    try {
      const shift = await openShift(terminalId, openingCashMinor);
      localStorage.setItem(STORAGE_KEYS.shiftId, shift.id);
      router.replace(ROUTES.till);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not open the shift');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="text-center text-2xl font-semibold text-neutral-900">Open shift</h1>
        <p className="text-center text-neutral-500">Count the drawer and enter the opening float.</p>

        <input
          className="field-input text-center"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="Opening float (Rs)"
          value={floatRupees}
          onChange={(e) => setFloatRupees(e.target.value)}
          required
        />

        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-center text-red-700">{error}</p>}

        <button type="submit" className="tap-btn" disabled={busy}>
          {busy ? 'Opening…' : 'Open shift'}
        </button>
      </form>
    </main>
  );
}
