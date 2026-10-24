'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { formatDateTime, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { Loading } from '@/components/ui';
import { paymentProviderLabel } from '@/constants/payment-methods';

interface PendingPayment {
  id: string;
  provider: string;
  amount: number;
  reference: string | null;
  receiptUrl: string | null;
  createdAt: string;
  order: {
    id: string;
    number: string;
    guestName: string | null;
    grandTotal: number;
    placedAt: string;
  };
}

/**
 * The money queue: bank transfers whose receipt a human has to check against
 * the bank statement before anything is dispatched.
 */
export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PendingPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPayments(await adminFetch<PendingPayment[]>('/admin/payments/awaiting-approval'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load payments');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(payment: PendingPayment) {
    const note = window.prompt(
      `Confirm ${formatMoney(payment.amount)} received for ${payment.order.number}?\n\nOptional note:`,
      'Checked against the bank statement',
    );
    // A null return means the staff member cancelled the dialog.
    if (note === null) return;

    setBusy(payment.id);
    setError(null);
    try {
      await adminFetch(`/admin/payments/${payment.id}/approve`, {
        method: 'POST',
        body: { note: note || undefined },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not approve the payment');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Payment approvals</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Bank transfers waiting on a human. Approving one confirms its order.
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {!payments ? (
        <Loading />
      ) : payments.length === 0 ? (
        <p className="p-8 text-center text-sm text-neutral-900/60">
          Nothing waiting. Every payment is settled.
        </p>
      ) : (
        <ul className="space-y-4">
          {payments.map((payment) => (
            <li key={payment.id} className="card flex flex-wrap gap-4 p-4">
              {payment.receiptUrl ? (
                <a
                  href={payment.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="relative h-32 w-24 shrink-0 overflow-hidden rounded border border-neutral-100"
                >
                  <Image
                    src={payment.receiptUrl}
                    alt={`Receipt for ${payment.order.number}`}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </a>
              ) : (
                <div className="flex h-32 w-24 shrink-0 items-center justify-center rounded border border-dashed border-neutral-100 p-2 text-center text-xs text-neutral-900/60">
                  No receipt uploaded
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900">{payment.order.number}</p>
                <p className="text-sm text-neutral-900/70">{payment.order.guestName}</p>
                <dl className="mt-2 space-y-0.5 text-xs text-neutral-900/60">
                  <div className="flex gap-2">
                    <dt>Amount</dt>
                    <dd className="font-medium text-neutral-900">{formatMoney(payment.amount)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt>Method</dt>
                    <dd>{paymentProviderLabel(payment.provider)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt>Reference</dt>
                    <dd className="font-mono">{payment.reference ?? '—'}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt>Placed</dt>
                    <dd>{formatDateTime(payment.order.placedAt)}</dd>
                  </div>
                </dl>
              </div>

              <div className="flex items-start">
                <button
                  type="button"
                  disabled={busy === payment.id}
                  onClick={() => void approve(payment)}
                  className="btn-primary"
                >
                  {busy === payment.id ? 'Approving…' : 'Approve payment'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
