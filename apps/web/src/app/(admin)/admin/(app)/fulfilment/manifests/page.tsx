'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { DataTable, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface Manifest {
  id: string;
  number: string;
  courierKey: string;
  status: 'OPEN' | 'DISPATCHED';
  dispatchedAt: string | null;
  createdAt: string;
  shipments: Array<{ id: string; trackingNumber: string | null; status: string }>;
}

/** WO-6.8's `/admin/fulfilment/manifests` — a day's pickup, grouped by courier. */
export default function ManifestsPage() {
  const [manifests, setManifests] = useState<Manifest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setManifests(await adminFetch<Manifest[]>('/admin/fulfilment/manifests'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load manifests');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createManifest() {
    const courierKey = window.prompt('Courier key (e.g. manual)', 'manual');
    if (!courierKey) return;
    setBusy(true);
    try {
      await adminFetch('/admin/fulfilment/manifests', { method: 'POST', body: { courierKey } });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the manifest');
    } finally {
      setBusy(false);
    }
  }

  async function dispatch(id: string) {
    setBusy(true);
    try {
      await adminFetch(`/admin/fulfilment/manifests/${id}/dispatch`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not dispatch the manifest');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Manifests"
        description="A day's pickup, grouped by courier — the printable handover sheet."
        action={
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void createManifest()}>
            New manifest
          </button>
        }
      />

      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}

      <div className="overflow-hidden">
        <DataTable
          rows={manifests}
          loading={manifests === null}
          rowKey={(row) => row.id}
          emptyLabel="No manifests yet. Group shipments for pickup by creating one."
          columns={[
            { header: 'Number', cell: (row) => row.number, className: 'font-medium' },
            { header: 'Courier', muted: true, cell: (row) => row.courierKey },
            { header: 'Shipments', align: 'end', numeric: true, cell: (row) => row.shipments.length },
            { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
            { header: 'Created', muted: true, cell: (row) => formatDateTime(row.createdAt) },
            {
              header: '',
              align: 'end',
              cell: (row) =>
                row.status === 'OPEN' ? (
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => void dispatch(row.id)}>
                    Dispatch
                  </button>
                ) : null,
            },
          ]}
        />
      </div>
    </>
  );
}
