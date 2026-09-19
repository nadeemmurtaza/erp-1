'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getReceipt, printReceipt, type PosReceiptData } from '@/lib/pos-client';
import { ApiError } from '@/lib/api-client';
import { ReceiptView } from '@/components/receipt-view';

/** Reprinting a past sale — looked up by order id (the Returns screen links here). */
export default function ReceiptPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const [receipt, setReceipt] = useState<PosReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getReceipt(params.orderId)
      .then(setReceipt)
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Could not load the receipt'));
  }, [params.orderId]);

  async function print() {
    setBusy(true);
    try {
      const updated = await printReceipt(params.orderId);
      setReceipt(updated);
      window.print();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not print the receipt');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-sm p-6 text-center">
        <p className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{error}</p>
        <button className="tap-btn-secondary mt-4" onClick={() => router.back()}>
          Back
        </button>
      </main>
    );
  }

  if (!receipt) {
    return (
      <main className="p-6 text-center text-neutral-500">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <ReceiptView receipt={receipt} />
      {receipt.printCount > 0 && (
        <p className="mt-2 text-center text-xs text-neutral-400">
          Printed {receipt.printCount} time{receipt.printCount === 1 ? '' : 's'}
        </p>
      )}
      <div className="mt-6 space-y-3">
        <button className="tap-btn" onClick={print} disabled={busy}>
          {busy ? 'Printing…' : 'Print receipt'}
        </button>
        <button className="tap-btn-secondary" onClick={() => router.back()}>
          Back
        </button>
      </div>
    </main>
  );
}
