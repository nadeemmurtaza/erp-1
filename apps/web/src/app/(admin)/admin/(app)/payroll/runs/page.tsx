'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDate } from '@newax/shared';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/utils/cn';
import { DataTable, EmptyState, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import type { PayRun } from '@/types/api';

/**
 * WO-19.6 (docs/implementation/19-payroll.md) — every pay run, and the form
 * to build a new one for a period.
 */
export default function PayrollRunsPage() {
  const router = useRouter();
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const canManage = getStoredUser()?.permissions.includes('payroll.manage') ?? false;

  const [runs, setRuns] = useState<PayRun[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [building, setBuilding] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRuns(await adminFetch<PayRun[]>('/admin/payroll/runs'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load pay runs');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function build(event: React.FormEvent) {
    event.preventDefault();
    setBuilding(true);
    try {
      const run = await adminFetch<PayRun>('/admin/payroll/runs', {
        method: 'POST',
        body: { periodStart, periodEnd, scopeLevel: 'BRAND' },
      });
      addToast('Pay run built.', 'success');
      router.push(`/admin/payroll/runs/${run.id}`);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not build the pay run', 'error');
    } finally {
      setBuilding(false);
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

      <PageHeader title="Pay runs" description="Build, approve and post payroll for a period." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {canManage ? (
        <form onSubmit={build} className="mb-6 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="field-label">Period start</span>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="field-input" required />
          </label>
          <label className="block">
            <span className="field-label">Period end</span>
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="field-input" required />
          </label>
          <button type="submit" disabled={building} className="btn-primary">
            {building ? 'Building…' : 'Build pay run'}
          </button>
        </form>
      ) : null}

      {!busy && runs && runs.length === 0 ? (
        <EmptyState title="No pay runs yet" description="Build one above for a pay period." />
      ) : (
        <div className="overflow-hidden">
          <DataTable
            rows={runs}
            loading={busy && !runs}
            rowKey={(row) => row.id}
            emptyLabel="No pay runs yet."
            columns={[
              {
                header: 'Number',
                cell: (row) => (
                  <Link href={`/admin/payroll/runs/${row.id}`} className="hover:underline">
                    {row.number}
                  </Link>
                ),
              },
              { header: 'Period', cell: (row) => `${formatDate(row.periodStart)} – ${formatDate(row.periodEnd)}` },
              { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
              { header: 'Scope', muted: true, cell: (row) => row.scopeLevel },
            ]}
          />
        </div>
      )}
    </>
  );
}
