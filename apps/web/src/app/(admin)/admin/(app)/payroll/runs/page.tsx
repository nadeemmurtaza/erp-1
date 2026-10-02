'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDate } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { DataTable, EmptyState, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import type { PayRun } from '@/types/api';
import { DateField } from '@/components/ui/date-field';

/**
 * WO-19.6 (docs/implementation/payroll/19-payroll.md) — every pay run, and the form
 * to build a new one for a period.
 */
export default function PayrollRunsPage() {
  const router = useRouter();
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const { can } = useAdminSession();
  const canManage = can('payroll.manage');

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
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader title="Pay runs" description="Build, approve and post payroll for a period." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {canManage ? (
        <form onSubmit={build} className="mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="run-start" className="field-label">
              Period start
            </label>
            <DateField id="run-start" value={periodStart} onChange={setPeriodStart} required />
          </div>
          <div>
            <label htmlFor="run-end" className="field-label">
              Period end
            </label>
            <DateField id="run-end" value={periodEnd} onChange={setPeriodEnd} required />
          </div>
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
