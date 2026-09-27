'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDate, formatMoney, toMinor } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { PageHeader, Loading, DataTable, Dialog, MetricStrip } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';

interface Drawdown {
  id: string;
  amountMinor: number;
  drawdownDate: string;
  note: string | null;
  createdById: string;
  approvedById: string | null;
  postedAt: string | null;
}

interface Repayment {
  id: string;
  principalMinor: number;
  markupMinor: number;
  repaymentDate: string;
  note: string | null;
}

interface Accrual {
  id: string;
  periodStart: string;
  periodEnd: string;
  amountMinor: number;
}

interface FacilityDetail {
  id: string;
  key: string;
  label: string;
  facilityType: string;
  limitMinor: number;
  utilizedMinor: number;
  markupRateBps: number;
  isFloatingRate: boolean;
  securityReference: string | null;
  startDate: string;
  maturityDate: string;
  status: 'ACTIVE' | 'CLOSED';
  bank: { id: string; name: string };
  drawdowns: Drawdown[];
  repayments: Repayment[];
  accruals: Accrual[];
}

/**
 * finance-accounting/167-bank-facility-management.md WO-167.6 — one
 * facility's own utilization, drawdown/repayment history and markup
 * accruals. A drawdown's maker-checker (request → approve → post) mirrors
 * settlements/[id]/page.tsx's own request/approve/post-write-off shape.
 */
export default function BankFacilityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useAdminSession();
  const canManage = session.can('finance.facilities.manage');
  const canApprove = session.can('finance.facilities.approve_drawdown');

  const [facility, setFacility] = useState<FacilityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [drawdownOpen, setDrawdownOpen] = useState(false);
  const [drawdownAmount, setDrawdownAmount] = useState('');
  const [drawdownDate, setDrawdownDate] = useState('');
  const [drawdownNote, setDrawdownNote] = useState('');

  const [repaymentOpen, setRepaymentOpen] = useState(false);
  const [principalAmount, setPrincipalAmount] = useState('');
  const [markupAmount, setMarkupAmount] = useState('');
  const [repaymentDate, setRepaymentDate] = useState('');
  const [repaymentNote, setRepaymentNote] = useState('');

  const load = () => {
    adminFetch<FacilityDetail>(`/admin/bank-facilities/${id}`)
      .then(setFacility)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this bank facility'));
  };

  useEffect(load, [id]);

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(path, { method: 'POST', body });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const submitDrawdown = async () => {
    if (!drawdownAmount || !drawdownDate) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/bank-facilities/${id}/drawdowns`, {
        method: 'POST',
        body: { amountMinor: toMinor(Number(drawdownAmount) || 0), drawdownDate, note: drawdownNote || undefined },
      });
      setDrawdownOpen(false);
      setDrawdownAmount('');
      setDrawdownDate('');
      setDrawdownNote('');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record this drawdown');
    } finally {
      setBusy(false);
    }
  };

  const submitRepayment = async () => {
    if (!repaymentDate || (!principalAmount && !markupAmount)) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/bank-facilities/${id}/repayments`, {
        method: 'POST',
        body: {
          principalMinor: toMinor(Number(principalAmount) || 0),
          markupMinor: toMinor(Number(markupAmount) || 0),
          repaymentDate,
          note: repaymentNote || undefined,
        },
      });
      setRepaymentOpen(false);
      setPrincipalAmount('');
      setMarkupAmount('');
      setRepaymentDate('');
      setRepaymentNote('');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record this repayment');
    } finally {
      setBusy(false);
    }
  };

  if (!facility) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading label="Loading bank facility" />
    );
  }

  const availableMinor = facility.limitMinor - facility.utilizedMinor;

  return (
    <>
      <PageHeader
        context={
          <Link href={ROUTES.admin.bankFacilities} className="hover:underline">
            ← Bank Facilities
          </Link>
        }
        title={facility.label}
        description={facility.bank.name}
        action={<StatusBadge status={facility.status} />}
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <MetricStrip
        label="Facility summary"
        className="mb-6"
        items={[
          { key: 'limit', label: 'Limit', value: formatMoney(facility.limitMinor) },
          { key: 'utilized', label: 'Utilized', value: formatMoney(facility.utilizedMinor) },
          { key: 'available', label: 'Available', value: formatMoney(availableMinor) },
          { key: 'markup', label: 'Markup rate', value: `${(facility.markupRateBps / 100).toFixed(2)}%${facility.isFloatingRate ? ' (floating)' : ''}` },
        ]}
      />

      <div className="card p-6 mb-6 max-w-md space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-900/60">Maturity</span>
          <span>{formatDate(facility.maturityDate)}</span>
        </div>
        {facility.securityReference ? (
          <div className="flex justify-between">
            <span className="text-neutral-900/60">Security</span>
            <span>{facility.securityReference}</span>
          </div>
        ) : null}
      </div>

      {canManage ? (
        <div className="mb-6 flex gap-2">
          <button className="btn-primary" onClick={() => setDrawdownOpen(true)}>
            Record drawdown
          </button>
          <button className="btn-secondary" onClick={() => setRepaymentOpen(true)}>
            Record repayment
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-900/60">Drawdowns</h2>
        <DataTable
          rows={facility.drawdowns}
          rowKey={(d) => d.id}
          emptyLabel="No drawdowns recorded."
          columns={[
            { header: 'Amount', align: 'end', numeric: true, cell: (d) => formatMoney(d.amountMinor) },
            { header: 'Date', cell: (d) => formatDate(d.drawdownDate), muted: true },
            {
              header: 'Status',
              cell: (d) => {
                if (d.postedAt) return <span className="notice notice-success inline-block px-2 py-0.5 text-xs">Posted</span>;
                if (d.approvedById) return <span className="notice notice-info inline-block px-2 py-0.5 text-xs">Approved</span>;
                return <span className="notice notice-info inline-block px-2 py-0.5 text-xs">Awaiting approval</span>;
              },
            },
            {
              header: '',
              cell: (d) => {
                if (d.postedAt) return null;
                if (!d.approvedById) {
                  if (!canApprove || d.createdById === session.id) {
                    return <span className="text-xs text-neutral-900/60">Needs a different approver</span>;
                  }
                  return (
                    <button className="btn-text text-xs" disabled={busy} onClick={() => act(`/admin/bank-facilities/drawdowns/${d.id}/approve`)}>
                      Approve
                    </button>
                  );
                }
                if (!canManage) return null;
                return (
                  <button className="btn-text text-xs" disabled={busy} onClick={() => act(`/admin/bank-facilities/drawdowns/${d.id}/post`)}>
                    Post
                  </button>
                );
              },
            },
          ]}
        />
      </div>

      <div className="overflow-hidden mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-900/60">Repayments</h2>
        <DataTable
          rows={facility.repayments}
          rowKey={(r) => r.id}
          emptyLabel="No repayments recorded."
          columns={[
            { header: 'Principal', align: 'end', numeric: true, cell: (r) => formatMoney(r.principalMinor) },
            { header: 'Markup', align: 'end', numeric: true, cell: (r) => formatMoney(r.markupMinor) },
            { header: 'Date', cell: (r) => formatDate(r.repaymentDate), muted: true },
          ]}
        />
      </div>

      <div className="overflow-hidden">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-900/60">Markup accruals</h2>
        <DataTable
          rows={facility.accruals}
          rowKey={(a) => a.id}
          emptyLabel="No markup accrued yet."
          columns={[
            { header: 'Period', cell: (a) => formatDate(a.periodStart), muted: true },
            { header: 'Amount', align: 'end', numeric: true, cell: (a) => formatMoney(a.amountMinor) },
          ]}
        />
      </div>

      <Dialog open={drawdownOpen} onClose={busy ? () => {} : () => setDrawdownOpen(false)} title="Record a drawdown">
        <div className="space-y-3">
          <label className="block">
            <span className="field-label">Amount</span>
            <input className="field-input w-full" type="number" min="0" value={drawdownAmount} onChange={(e) => setDrawdownAmount(e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Drawdown date</span>
            <input className="field-input w-full" type="date" value={drawdownDate} onChange={(e) => setDrawdownDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Note</span>
            <textarea className="field-input w-full" rows={2} value={drawdownNote} onChange={(e) => setDrawdownNote(e.target.value)} placeholder="Optional" />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => setDrawdownOpen(false)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !drawdownAmount || !drawdownDate} onClick={submitDrawdown}>
            Record
          </button>
        </div>
      </Dialog>

      <Dialog open={repaymentOpen} onClose={busy ? () => {} : () => setRepaymentOpen(false)} title="Record a repayment">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Principal</span>
              <input className="field-input w-full" type="number" min="0" value={principalAmount} onChange={(e) => setPrincipalAmount(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Markup</span>
              <input className="field-input w-full" type="number" min="0" value={markupAmount} onChange={(e) => setMarkupAmount(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="field-label">Repayment date</span>
            <input className="field-input w-full" type="date" value={repaymentDate} onChange={(e) => setRepaymentDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Note</span>
            <textarea className="field-input w-full" rows={2} value={repaymentNote} onChange={(e) => setRepaymentNote(e.target.value)} placeholder="Optional" />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => setRepaymentOpen(false)}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy || !repaymentDate || (!principalAmount && !markupAmount)}
            onClick={submitRepayment}
          >
            Record
          </button>
        </div>
      </Dialog>
    </>
  );
}
