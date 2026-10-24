'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDate, formatMoney } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { PageHeader, Loading } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface CreditNoteDetail {
  id: string;
  number: string;
  customerId: string;
  orderId: string | null;
  appliedToOrderId: string | null;
  amountMinor: number;
  reason: string;
  status: 'DRAFT' | 'ISSUED' | 'APPLIED' | 'VOID';
  createdById: string;
  approvedById: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  createdAt: string;
}

export default function CreditNoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [note, setNote] = useState<CreditNoteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applyOrderId, setApplyOrderId] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [showApply, setShowApply] = useState(false);
  const [showVoid, setShowVoid] = useState(false);

  const load = () => {
    adminFetch<CreditNoteDetail>(`/admin/credit-notes/${id}`)
      .then(setNote)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load credit note'));
  };

  useEffect(load, [id]);

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/credit-notes/${id}${path}`, { method: 'POST', body });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (!note) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading label="Loading credit note" />
    );
  }

  return (
    <>
      <PageHeader
        context={
          <Link href={ROUTES.admin.creditNotes} className="hover:underline">
            ← Credit Notes
          </Link>
        }
        title={note.number}
        description={note.reason}
        action={<StatusBadge status={note.status} />}
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card p-6 mb-6 max-w-md space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-900/60">Amount</span>
          <span className="font-medium tabular-nums">{formatMoney(note.amountMinor)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-900/60">Order</span>
          <span>{note.orderId ?? '— goodwill credit, no order cited —'}</span>
        </div>
        {note.appliedToOrderId ? (
          <div className="flex justify-between">
            <span className="text-neutral-900/60">Applied to</span>
            <span>{note.appliedToOrderId}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span className="text-neutral-900/60">Created</span>
          <span>{formatDate(note.createdAt)}</span>
        </div>
        {note.issuedAt ? (
          <div className="flex justify-between">
            <span className="text-neutral-900/60">Issued</span>
            <span>{formatDate(note.issuedAt)}</span>
          </div>
        ) : null}
        {note.voidedAt ? (
          <div className="flex justify-between">
            <span className="text-neutral-900/60">Voided</span>
            <span>{formatDate(note.voidedAt)}</span>
          </div>
        ) : null}
        {note.approvedById ? (
          <div className="flex justify-between">
            <span className="text-neutral-900/60">Approved</span>
            <span>yes</span>
          </div>
        ) : null}
      </div>

      {note.status === 'DRAFT' ? (
        <div className="card p-6 max-w-md space-y-3 mb-4">
          <h2 className="font-medium text-neutral-900">Approve &amp; issue</h2>
          <p className="text-xs text-neutral-900/60">
            Above the configured approval threshold, issuing requires a prior approval from someone other than this
            note&apos;s own creator — refused server-side.
          </p>
          <div className="flex gap-3">
            <button onClick={() => act('/approve')} disabled={busy} className="btn-secondary">
              Approve
            </button>
            <button onClick={() => act('/issue')} disabled={busy} className="btn-primary">
              Issue
            </button>
          </div>
        </div>
      ) : null}

      {note.status === 'ISSUED' ? (
        <div className="card p-6 max-w-md space-y-3 mb-4">
          <h2 className="font-medium text-neutral-900">Apply to a different order</h2>
          {showApply ? (
            <>
              <input
                className="field-input w-full"
                value={applyOrderId}
                onChange={(e) => setApplyOrderId(e.target.value)}
                placeholder="Order id to apply this credit to"
              />
              <button
                onClick={() => act('/apply', { orderId: applyOrderId })}
                disabled={busy || !applyOrderId.trim()}
                className="btn-primary"
              >
                Apply
              </button>
            </>
          ) : (
            <button onClick={() => setShowApply(true)} className="btn-secondary">
              Apply to another order
            </button>
          )}
        </div>
      ) : null}

      {note.status === 'ISSUED' || note.status === 'APPLIED' ? (
        <div className="card p-6 max-w-md space-y-3">
          <h2 className="font-medium text-neutral-900">Void</h2>
          <p className="text-xs text-neutral-900/60">Reverses the posted ledger entry — the note itself is never deleted.</p>
          {showVoid ? (
            <>
              <textarea
                className="field-input w-full"
                rows={2}
                placeholder="Optional reason"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
              />
              <button onClick={() => act('/void', { reason: voidReason || undefined })} disabled={busy} className="btn-danger">
                Confirm void
              </button>
            </>
          ) : (
            <button onClick={() => setShowVoid(true)} className="btn-danger">
              Void this note
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
