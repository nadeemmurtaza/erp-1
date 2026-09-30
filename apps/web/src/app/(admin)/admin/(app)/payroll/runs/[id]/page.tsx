'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { formatDate, formatMoney, toMinor } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/utils/cn';
import { DataTable, Dialog, Loading, MetricStrip, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import type { PayRunAdjustmentReason, PayRunWithLines } from '@/types/api';

const ADJUSTMENT_REASONS: PayRunAdjustmentReason[] = ['OVERPAYMENT', 'UNDERPAYMENT', 'CORRECTION'];

function displayName(u: { firstName: string | null; lastName: string | null; email: string | null }): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
  return name || u.email || 'Unknown';
}

/**
 * WO-19.6 (docs/implementation/payroll/19-payroll.md) — one pay run: every line,
 * the build/approve/post lifecycle, and posting an adjustment once POSTED.
 */
export default function PayrollRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const { can } = useAdminSession();
  const canManage = can('payroll.manage');

  const [run, setRun] = useState<PayRunWithLines | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustUserId, setAdjustUserId] = useState('');
  const [adjustReason, setAdjustReason] = useState<PayRunAdjustmentReason>('OVERPAYMENT');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRun(await adminFetch<PayRunWithLines>(`/admin/payroll/runs/${id}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this pay run');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve() {
    setBusy(true);
    try {
      await adminFetch(`/admin/payroll/runs/${id}/approve`, { method: 'PATCH' });
      addToast('Pay run approved.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not approve the pay run', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function post() {
    setBusy(true);
    try {
      await adminFetch(`/admin/payroll/runs/${id}/post`, { method: 'PATCH' });
      addToast('Pay run posted.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not post the pay run', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function postAdjustment(event: React.FormEvent) {
    event.preventDefault();
    setPosting(true);
    try {
      await adminFetch(`/admin/payroll/runs/${id}/adjustments`, {
        method: 'POST',
        body: {
          userId: adjustUserId,
          reason: adjustReason,
          amountMinor: toMinor(Number(adjustAmount)),
          note: adjustNote,
        },
      });
      addToast('Adjustment posted.', 'success');
      setAdjustOpen(false);
      setAdjustAmount('');
      setAdjustNote('');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not post the adjustment', 'error');
    } finally {
      setPosting(false);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="Pay run" />
        <p role="alert" className="text-sm text-feedback-negative">
          {error}
        </p>
      </>
    );
  }

  if (!run) {
    return (
      <>
        <PageHeader title="Pay run" />
        <Loading />
      </>
    );
  }

  const totalGross = run.lines.reduce((sum, l) => sum + l.grossMinor, 0);
  const totalNet = run.lines.reduce((sum, l) => sum + l.netMinor, 0);
  const totalUnpaidLeave = run.lines.reduce((sum, l) => sum + l.unpaidLeaveMinor, 0);

  return (
    <>
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-toast flex flex-col gap-2">
          {toasts.map((t) => (
            <button
              key={t.id}
              className={cn(
                'w-full cursor-pointer rounded-md border p-4 text-start text-sm shadow-md',
                t.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800',
              )}
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label={`Dismiss: ${t.message}`}
            >
              {t.message}
            </button>
          ))}
        </div>
      )}

      <PageHeader
        title={run.number}
        description={`${formatDate(run.periodStart)} – ${formatDate(run.periodEnd)}`}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={run.status} />
            {canManage && run.status === 'DRAFT' ? (
              <button type="button" onClick={() => void approve()} disabled={busy} className="btn-secondary">
                Approve
              </button>
            ) : null}
            {canManage && run.status === 'APPROVED' ? (
              <button type="button" onClick={() => void post()} disabled={busy} className="btn-primary">
                Post
              </button>
            ) : null}
            {canManage && run.status === 'POSTED' ? (
              <button type="button" onClick={() => setAdjustOpen(true)} className="btn-secondary">
                Post adjustment
              </button>
            ) : null}
          </div>
        }
      />

      <div className="mb-6">
        <MetricStrip
          label="Pay run summary"
          items={[
            { key: 'gross', label: 'Total gross', value: formatMoney(totalGross) },
            { key: 'unpaid', label: 'Unpaid leave deducted', value: formatMoney(totalUnpaidLeave) },
            { key: 'net', label: 'Total net', value: formatMoney(totalNet) },
            { key: 'lines', label: 'Employees', value: run.lines.length },
          ]}
        />
      </div>

      <div className="overflow-hidden">
        <DataTable
          rows={run.lines}
          rowKey={(line) => line.id}
          emptyLabel="No lines on this run."
          columns={[
            { header: 'Employee', cell: (line) => displayName(line.user) },
            { header: 'Gross', numeric: true, align: 'end', cell: (line) => formatMoney(line.grossMinor) },
            {
              header: 'Unpaid leave',
              numeric: true,
              align: 'end',
              muted: true,
              cell: (line) => (line.unpaidLeaveDays > 0 ? `${line.unpaidLeaveDays}d / ${formatMoney(line.unpaidLeaveMinor)}` : '—'),
            },
            { header: 'Net', numeric: true, align: 'end', cell: (line) => formatMoney(line.netMinor) },
          ]}
        />
      </div>

      {run.adjustments.length > 0 ? (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-medium text-neutral-900">Adjustments</h2>
          <div className="overflow-hidden">
            <DataTable
              rows={run.adjustments}
              rowKey={(a) => a.id}
              columns={[
                { header: 'Reason', cell: (a) => a.reason },
                { header: 'Amount', numeric: true, align: 'end', cell: (a) => formatMoney(a.amountMinor) },
                { header: 'Note', muted: true, cell: (a) => a.note },
                { header: 'Posted', muted: true, cell: (a) => formatDate(a.createdAt) },
              ]}
            />
          </div>
        </div>
      ) : null}

      <Dialog open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Post an adjustment">
        <form onSubmit={postAdjustment} className="space-y-3">
          <label className="block">
            <span className="field-label">Employee</span>
            <select value={adjustUserId} onChange={(e) => setAdjustUserId(e.target.value)} className="field-input" required>
              <option value="">Select…</option>
              {run.lines.map((line) => (
                <option key={line.userId} value={line.userId}>
                  {displayName(line.user)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Reason</span>
            <select value={adjustReason} onChange={(e) => setAdjustReason(e.target.value as PayRunAdjustmentReason)} className="field-input">
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Amount (Rs)</span>
            <input type="number" min="0" step="1" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} className="field-input" required />
          </label>
          <label className="block">
            <span className="field-label">Note</span>
            <input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} className="field-input" required />
          </label>
          <button type="submit" disabled={posting} className="btn-primary">
            {posting ? 'Posting…' : 'Post adjustment'}
          </button>
        </form>
      </Dialog>
    </>
  );
}
