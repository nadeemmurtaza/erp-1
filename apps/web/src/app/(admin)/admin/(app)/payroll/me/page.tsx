'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/utils/cn';
import { DataTable, EmptyState, MetricStrip, PageHeader, Section } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import type { EmployeeCompensation, EmployeeLeave, LeaveType } from '@/types/api';
import { DateField } from '@/components/ui/date-field';

/**
 * WO-19.6 (docs/implementation/payroll/19-payroll.md) — self-service: the signed-in
 * user's own compensation history, leave balance, and a form to request
 * time off. Reachable for STAFF/TAILOR who hold no other payroll
 * permission (payroll.view_own only).
 */
export default function MyPayPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [compensation, setCompensation] = useState<EmployeeCompensation | null>(null);
  const [leave, setLeave] = useState<EmployeeLeave | null>(null);
  const [types, setTypes] = useState<LeaveType[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [comp, myLeave, leaveTypes] = await Promise.all([
        adminFetch<EmployeeCompensation>('/admin/payroll/compensation/me'),
        adminFetch<EmployeeLeave>('/admin/payroll/leave/me'),
        adminFetch<LeaveType[]>('/admin/payroll/leave/types'),
      ]);
      setCompensation(comp);
      setLeave(myLeave);
      setTypes(leaveTypes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your pay information');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestLeave(event: React.FormEvent) {
    event.preventDefault();
    setRequesting(true);
    try {
      await adminFetch('/admin/payroll/leave/me', {
        method: 'POST',
        body: { leaveTypeId, startDate, endDate, reason: reason || undefined },
      });
      addToast('Leave request submitted.', 'success');
      setStartDate('');
      setEndDate('');
      setReason('');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not submit the request', 'error');
    } finally {
      setRequesting(false);
    }
  }

  async function cancel(requestId: string) {
    try {
      await adminFetch(`/admin/payroll/leave/me/${requestId}/cancel`, { method: 'POST' });
      addToast('Request cancelled.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not cancel the request', 'error');
    }
  }

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

      <PageHeader title="My pay" description="Your compensation history and leave balance." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <Section title="Compensation">
        {compensation?.current ? (
          <MetricStrip
            label="Current rate"
            items={[
              { key: 'basis', label: 'Basis', value: compensation.current.basis },
              { key: 'rate', label: 'Rate', value: formatMoney(compensation.current.amountMinor) },
              { key: 'since', label: 'Effective from', value: formatDate(compensation.current.effectiveFrom) },
            ]}
          />
        ) : (
          <EmptyState title="No compensation rate on file" description="Ask an admin to set one." />
        )}
      </Section>

      <Section title="Leave balance">
        {leave && leave.balances.length > 0 ? (
          <div className="overflow-hidden">
            <DataTable
              rows={leave.balances}
              rowKey={(b) => b.id}
              columns={[
                { header: 'Type', cell: (b) => b.leaveType.name },
                { header: 'Balance (days)', numeric: true, align: 'end', cell: (b) => b.balance },
              ]}
            />
          </div>
        ) : (
          <EmptyState title="No leave balance yet" />
        )}
      </Section>

      <Section title="Request leave">
        <form onSubmit={requestLeave} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="field-label">Type</span>
            <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className="field-input" required>
              <option value="">Select…</option>
              {types?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <label htmlFor="leave-from" className="field-label">
              From
            </label>
            <DateField id="leave-from" value={startDate} onChange={setStartDate} required />
          </div>
          <div>
            <label htmlFor="leave-to" className="field-label">
              To
            </label>
            <DateField id="leave-to" value={endDate} onChange={setEndDate} required />
          </div>
          <label className="block flex-1 min-w-[12rem]">
            <span className="field-label">Reason (optional)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="field-input" />
          </label>
          <button type="submit" disabled={requesting} className="btn-primary">
            {requesting ? 'Submitting…' : 'Request'}
          </button>
        </form>
      </Section>

      <Section title="Your requests">
        {leave && leave.requests.length > 0 ? (
          <div className="overflow-hidden">
            <DataTable
              rows={leave.requests}
              rowKey={(r) => r.id}
              columns={[
                { header: 'Type', cell: (r) => r.leaveType.name, muted: true },
                { header: 'Dates', cell: (r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}` },
                { header: 'Days', numeric: true, align: 'end', cell: (r) => r.days },
                { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
                {
                  header: '',
                  align: 'end',
                  cell: (r) =>
                    r.status === 'PENDING' ? (
                      <button type="button" onClick={() => void cancel(r.id)} className="text-xs text-neutral-900/60 hover:text-neutral-900">
                        Cancel
                      </button>
                    ) : null,
                },
              ]}
            />
          </div>
        ) : (
          <EmptyState title="No leave requests yet" description="Request time off above." />
        )}
      </Section>
    </>
  );
}
