'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDate } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/utils/cn';
import { DataTable, EmptyState, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import type { LeaveRequest, LeaveRequestStatus } from '@/types/api';

const FILTERS: Array<LeaveRequestStatus | 'ALL'> = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL'];

function displayName(u?: { firstName: string | null; lastName: string | null; email: string | null }): string {
  if (!u) return 'Unknown';
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
  return name || u.email || 'Unknown';
}

/**
 * WO-19.6 (docs/implementation/19-payroll.md) — every leave request across
 * every employee, with approve/reject actions on PENDING ones.
 */
export default function PayrollLeavePage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('PENDING');
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRequests(
        await adminFetch<LeaveRequest[]>('/admin/payroll/leave', {
          query: filter === 'ALL' ? {} : { status: filter },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load leave requests');
    } finally {
      setBusy(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(requestId: string, status: 'APPROVED' | 'REJECTED') {
    const note = status === 'REJECTED' ? window.prompt('Reason for rejecting (optional):') ?? undefined : undefined;
    setDecidingId(requestId);
    try {
      await adminFetch(`/admin/payroll/leave/${requestId}/decide`, { method: 'PATCH', body: { status, note } });
      addToast(status === 'APPROVED' ? 'Leave approved.' : 'Leave rejected.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not decide this request', 'error');
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <>
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
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

      <PageHeader title="Leave requests" description="Approve or reject time off across every employee." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div role="group" aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn('chip', filter === f ? 'bg-neutral-900 text-white' : undefined)}
          >
            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {!busy && requests && requests.length === 0 ? (
        <EmptyState title="No leave requests" description="Nothing matches this filter." />
      ) : (
        <div className="overflow-hidden">
          <DataTable
            rows={requests}
            loading={busy && !requests}
            rowKey={(row) => row.id}
            emptyLabel="No leave requests."
            columns={[
              { header: 'Employee', cell: (row) => displayName(row.user) },
              { header: 'Type', cell: (row) => row.leaveType.name, muted: true },
              { header: 'Dates', cell: (row) => `${formatDate(row.startDate)} – ${formatDate(row.endDate)}` },
              { header: 'Days', numeric: true, align: 'end', cell: (row) => row.days },
              { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
              {
                header: '',
                align: 'end',
                cell: (row) =>
                  row.status === 'PENDING' ? (
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => void decide(row.id, 'APPROVED')}
                        disabled={decidingId === row.id}
                        className="text-xs text-green-700 hover:underline"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void decide(row.id, 'REJECTED')}
                        disabled={decidingId === row.id}
                        className="text-xs text-red-700 hover:underline"
                      >
                        Reject
                      </button>
                    </div>
                  ) : null,
              },
            ]}
          />
        </div>
      )}
    </>
  );
}
