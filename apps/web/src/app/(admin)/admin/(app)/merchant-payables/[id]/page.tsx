'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import { formatDateTime, formatMoney } from '@newax/shared';
import { PageHeader, Section } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface MerchantPayable {
  id: string;
  organizationId: string;
  orderId: string;
  grossMinor: number;
  platformFeeMinor: number;
  netPayableMinor: number;
  status: 'OPEN' | 'SCHEDULED' | 'PAID' | 'DISPUTED';
  scheduledPayoutAt: string | null;
  paidAt: string | null;
  disputedByUserId: string | null;
  disputeReason: string | null;
  createdAt: string;
}

/** doc 155 §3 — one payable's own gross/fee/net breakdown, status, and the dispute/resolve actions `finance.merchant-payables.dispute` gates. */
export default function MerchantPayableDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [payable, setPayable] = useState<MerchantPayable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { can } = useAdminSession();
  const canDispute = can('finance.merchant-payables.dispute');

  function load() {
    adminFetch<MerchantPayable>(`/admin/merchant-payables/${id}`)
      .then(setPayable)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load this payable.'));
  }

  useEffect(load, [id]);

  async function dispute(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await adminFetch(`/admin/merchant-payables/${id}/dispute`, { method: 'POST', body: { reason: disputeReason } });
      setDisputeReason('');
      load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not dispute this payable.');
    } finally {
      setBusy(false);
    }
  }

  async function resolve(resolution: 'OPEN' | 'SCHEDULED') {
    setBusy(true);
    setMessage(null);
    try {
      await adminFetch(`/admin/merchant-payables/${id}/resolve-dispute`, { method: 'POST', body: { resolution } });
      load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not resolve this dispute — you may be the same person who disputed it.');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="Merchant payable" />
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      </>
    );
  }

  if (!payable) {
    return (
      <>
        <PageHeader title="Merchant payable" />
        <p className="text-neutral-900/60">Loading…</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Payable for order ${payable.orderId}`}
        description={`Merchant organization ${payable.organizationId}`}
        context={<StatusBadge status={payable.status} />}
      />

      <Section title="Breakdown">
        <dl className="grid max-w-md grid-cols-2 gap-y-2 text-sm">
          <dt className="text-neutral-900/60">Gross</dt>
          <dd className="text-end tabular-nums">{formatMoney(payable.grossMinor)}</dd>
          <dt className="text-neutral-900/60">Platform fee</dt>
          <dd className="text-end tabular-nums">{formatMoney(payable.platformFeeMinor)}</dd>
          <dt className="text-neutral-900/60">Net payable</dt>
          <dd className="text-end font-medium tabular-nums">{formatMoney(payable.netPayableMinor)}</dd>
          <dt className="text-neutral-900/60">Scheduled payout</dt>
          <dd className="text-end">{payable.scheduledPayoutAt ? formatDateTime(payable.scheduledPayoutAt) : '—'}</dd>
          <dt className="text-neutral-900/60">Paid</dt>
          <dd className="text-end">{payable.paidAt ? formatDateTime(payable.paidAt) : '—'}</dd>
        </dl>
      </Section>

      {message ? <p className="notice notice-error mb-4">{message}</p> : null}

      {!canDispute ? (
        <p className="notice notice-info">
          Disputing or resolving a payable needs the &ldquo;Mark payables disputed / resolve&rdquo; permission.
        </p>
      ) : payable.status === 'DISPUTED' ? (
        <Section title="Disputed">
          <p className="mb-2 text-sm text-neutral-900/80">{payable.disputeReason}</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => resolve('SCHEDULED')} className="btn-primary">
              Resolve — schedule for payout
            </button>
            <button type="button" disabled={busy} onClick={() => resolve('OPEN')} className="btn-secondary">
              Resolve — return to OPEN
            </button>
          </div>
        </Section>
      ) : payable.status !== 'PAID' ? (
        <Section title="Dispute this payable">
          <form onSubmit={dispute} className="flex max-w-lg items-end gap-2">
            <div className="flex-1">
              <label className="field-label" htmlFor="disputeReason">
                Reason
              </label>
              <input
                id="disputeReason"
                className="field-input"
                value={disputeReason}
                onChange={(event) => setDisputeReason(event.target.value)}
                required
              />
            </div>
            <button type="submit" disabled={busy} className="btn-danger">
              Dispute
            </button>
          </form>
        </Section>
      ) : null}
    </>
  );
}
