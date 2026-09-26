'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDate, formatMoney } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { PageHeader, Loading, DataTable } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';

interface BatchLine {
  id: string;
  amountMinor: number;
  payment: { id: string; amount: number; provider: string; createdAt: string };
}

interface BatchDetail {
  id: string;
  externalBatchRef: string;
  expectedAmountMinor: number;
  settledAmountMinor: number | null;
  settledAt: string | null;
  status: 'EXPECTED' | 'CONFIRMED' | 'SHORT' | 'DISPUTED';
  writeoffRequestedById: string | null;
  writeoffApprovedById: string | null;
  writeoffNote: string | null;
  writtenOffAt: string | null;
  createdAt: string;
  provider: { id: string; key: string; label: string };
  lines: BatchLine[];
}

/**
 * finance-accounting/49-financial-institution-settlement-partnerships.md
 * WO-49.6 — one batch's own reconciliation state and the maker-checker
 * write-off flow (request → approve → post), mirroring
 * credit-notes/[id]/page.tsx's own approve/issue shape.
 */
export default function SettlementBatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useAdminSession();
  const canReconcile = session.can('finance.settlement.reconcile');
  const canApprove = session.can('finance.settlement.approve_writeoff');

  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRequestWriteoff, setShowRequestWriteoff] = useState(false);
  const [writeoffNote, setWriteoffNote] = useState('');

  const load = () => {
    adminFetch<BatchDetail>(`/admin/settlements/batches/${id}`)
      .then(setBatch)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this settlement batch'));
  };

  useEffect(load, [id]);

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/settlements/batches/${id}${path}`, { method: 'POST', body });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (!batch) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading label="Loading settlement batch" />
    );
  }

  const shortfallMinor =
    batch.status === 'SHORT' ? batch.expectedAmountMinor - (batch.settledAmountMinor ?? 0) : 0;
  const isSelfRequester = batch.writeoffRequestedById === session.id;

  return (
    <>
      <PageHeader
        context={
          <Link href={ROUTES.admin.settlements} className="hover:underline">
            ← Settlements
          </Link>
        }
        title={batch.externalBatchRef}
        description={batch.provider.label}
        action={<StatusBadge status={batch.status} />}
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card p-6 mb-6 max-w-md space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-900/60">Expected</span>
          <span className="font-medium tabular-nums">{formatMoney(batch.expectedAmountMinor)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-900/60">Settled</span>
          <span className="font-medium tabular-nums">
            {batch.settledAmountMinor === null ? '— not yet reconciled —' : formatMoney(batch.settledAmountMinor)}
          </span>
        </div>
        {batch.status === 'SHORT' ? (
          <div className="flex justify-between">
            <span className="text-neutral-900/60">Shortfall</span>
            <span className="font-medium tabular-nums text-red-700">{formatMoney(shortfallMinor)}</span>
          </div>
        ) : null}
        {batch.settledAt ? (
          <div className="flex justify-between">
            <span className="text-neutral-900/60">Settled on</span>
            <span>{formatDate(batch.settledAt)}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span className="text-neutral-900/60">Recorded</span>
          <span>{formatDate(batch.createdAt)}</span>
        </div>
        {batch.writtenOffAt ? (
          <div className="flex justify-between">
            <span className="text-neutral-900/60">Written off</span>
            <span>{formatDate(batch.writtenOffAt)}</span>
          </div>
        ) : null}
      </div>

      {batch.status === 'EXPECTED' && canReconcile ? (
        <div className="card p-6 max-w-md space-y-3 mb-6">
          <h2 className="font-medium text-neutral-900">Reconcile</h2>
          <p className="text-xs text-neutral-900/60">
            Asks this provider&apos;s own connector what actually settled. No real connector exists in this
            deployment yet, so this refuses until one is registered.
          </p>
          <button onClick={() => act('/reconcile')} disabled={busy} className="btn-primary">
            Reconcile now
          </button>
        </div>
      ) : null}

      {batch.status === 'SHORT' ? (
        <div className="card p-6 max-w-md space-y-3 mb-6">
          <h2 className="font-medium text-neutral-900">Write off the shortfall</h2>
          <p className="text-xs text-neutral-900/60">
            Above the configured threshold, writing off requires a prior approval from someone other than whoever
            requested it — refused server-side either way.
          </p>

          {!batch.writeoffRequestedById && canReconcile ? (
            showRequestWriteoff ? (
              <>
                <textarea
                  className="field-input w-full"
                  rows={2}
                  placeholder="Optional note"
                  value={writeoffNote}
                  onChange={(e) => setWriteoffNote(e.target.value)}
                />
                <button
                  onClick={() => act('/request-writeoff', { note: writeoffNote || undefined })}
                  disabled={busy}
                  className="btn-secondary"
                >
                  Request write-off
                </button>
              </>
            ) : (
              <button onClick={() => setShowRequestWriteoff(true)} className="btn-secondary">
                Request write-off
              </button>
            )
          ) : null}

          {batch.writeoffRequestedById && !batch.writeoffApprovedById ? (
            canApprove && !isSelfRequester ? (
              <button onClick={() => act('/approve-writeoff')} disabled={busy} className="btn-secondary">
                Approve write-off
              </button>
            ) : (
              <p className="notice notice-info">
                {isSelfRequester
                  ? 'You requested this write-off — a different approver must confirm it before it can post.'
                  : 'Awaiting approval from someone holding finance.settlement.approve_writeoff.'}
              </p>
            )
          ) : null}

          {canReconcile ? (
            <button onClick={() => act('/write-off')} disabled={busy} className="btn-danger">
              Post write-off
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-hidden">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-900/60">
          Payments this batch covers
        </h2>
        <DataTable
          rows={batch.lines}
          rowKey={(l) => l.id}
          emptyLabel="No payment lines."
          columns={[
            { header: 'Payment', cell: (l) => l.payment.id, muted: true },
            { header: 'Provider', cell: (l) => l.payment.provider, muted: true },
            { header: 'Amount', align: 'end', numeric: true, cell: (l) => formatMoney(l.amountMinor) },
            { header: 'Date', cell: (l) => formatDate(l.payment.createdAt), muted: true },
          ]}
        />
      </div>
    </>
  );
}
