'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { PageHeader, DataTable, EmptyState } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface VarianceRow {
  id: string;
  overshootQty: number;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
  resolvedByUserId: string | null;
  variant: { id: string; sku: string; label: string };
  location: { id: string; name: string; code: string };
  posShift: { id: string; openedByUserId: string; closedByUserId: string | null; openedAt: string; closedAt: string | null; status: string } | null;
}

export default function VariancesByShiftPage() {
  const [rows, setRows] = useState<VarianceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    adminFetch<VarianceRow[]>('/admin/inventory/variances/by-shift')
      .then(setRows)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load variances'));
  };

  useEffect(load, []);

  const resolve = async (id: string) => {
    setBusyId(id);
    setNote(null);
    try {
      await adminFetch(`/admin/inventory/variances/${id}/resolve`, { method: 'POST', body: {} });
      load();
    } catch (cause) {
      setNote(
        cause instanceof Error
          ? cause.message
          : 'Could not resolve this variance — the employee whose shift it belongs to cannot resolve it themselves.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Variances by shift"
        description="Every variance opened while a specific employee had the till open — the employee whose shift it belongs to cannot resolve it themselves."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}
      {note ? (
        <p role="alert" className="notice notice-error mb-4">
          {note}
        </p>
      ) : null}

      {rows && rows.length === 0 ? (
        <EmptyState title="No shift-attributed variances" description="Nothing has been flagged yet." />
      ) : (
        <div className="overflow-hidden">
          <DataTable
            rows={rows}
            loading={!rows}
            emptyLabel="No variances found."
            rowKey={(r) => r.id}
            columns={[
              { header: 'Item', cell: (r) => `${r.variant.label} (${r.variant.sku})` },
              { header: 'Location', cell: (r) => r.location.name, muted: true },
              { header: 'Overshoot', align: 'end', cell: (r) => r.overshootQty },
              { header: 'Shift opened', cell: (r) => (r.posShift ? formatDateTime(r.posShift.openedAt) : '—'), muted: true },
              { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
              {
                header: '',
                align: 'end',
                cell: (r) =>
                  r.status === 'OPEN' ? (
                    <button onClick={() => resolve(r.id)} disabled={busyId === r.id} className="text-xs font-medium text-accent-hover hover:underline">
                      Resolve
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-900/60">Resolved</span>
                  ),
              },
            ]}
          />
        </div>
      )}
    </>
  );
}
