'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { DataTable, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface Shipment {
  id: string;
  courier: string;
  trackingNumber: string | null;
  status: 'PENDING' | 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED' | 'LOST';
  isRto: boolean;
  createdAt: string;
  order: { id: string; number: string };
}

const NEXT_STATUS: Record<Shipment['status'], Shipment['status'][]> = {
  PENDING: ['DISPATCHED'],
  DISPATCHED: ['IN_TRANSIT', 'DELIVERED', 'RETURNED', 'LOST'],
  IN_TRANSIT: ['DELIVERED', 'RETURNED', 'LOST'],
  DELIVERED: ['RETURNED'],
  RETURNED: [],
  LOST: [],
};

/**
 * WO-6.8's `/admin/fulfilment/shipments` — every shipment, with a manual
 * status update for `manual`-courier shipments (ManualCourierProvider.track()
 * has nothing to poll, so this is the only way one ever advances).
 */
export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      setShipments(await adminFetch<Shipment[]>('/admin/fulfilment/shipments'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load shipments');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function recordStatus(shipment: Shipment, status: Shipment['status']) {
    setBusyId(shipment.id);
    try {
      await adminFetch(`/admin/fulfilment/shipments/${shipment.id}/status`, {
        method: 'POST',
        body: { status },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the shipment');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Shipments"
        description="Every parcel dispatched, its tracking status, and whether it came back as an RTO."
      />

      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}

      <div className="overflow-hidden">
        <DataTable
          rows={shipments}
          loading={shipments === null}
          rowKey={(row) => row.id}
          emptyLabel="No shipments recorded yet."
          columns={[
            {
              header: 'Order',
              cell: (row) => (
                <Link href={`/admin/orders/${row.order.id}`} className="font-medium text-accent-hover hover:underline">
                  {row.order.number}
                </Link>
              ),
            },
            { header: 'Courier', muted: true, cell: (row) => row.courier },
            { header: 'Tracking #', muted: true, cell: (row) => row.trackingNumber ?? '—' },
            {
              header: 'Status',
              cell: (row) => (
                <div className="flex items-center gap-2">
                  <StatusBadge status={row.status} />
                  {row.isRto ? <StatusBadge status="RETURNED" label="RTO" /> : null}
                </div>
              ),
            },
            { header: 'Dispatched', muted: true, cell: (row) => formatDateTime(row.createdAt) },
            {
              header: '',
              align: 'end',
              cell: (row) => {
                const options = NEXT_STATUS[row.status];
                if (options.length === 0) return null;
                return (
                  <select
                    className="field-input py-1 text-sm"
                    disabled={busyId === row.id}
                    value=""
                    onChange={(event) => {
                      const next = event.target.value as Shipment['status'];
                      if (next) void recordStatus(row, next);
                    }}
                  >
                    <option value="" disabled>
                      Update status…
                    </option>
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option.replace('_', ' ').toLowerCase()}
                      </option>
                    ))}
                  </select>
                );
              },
            },
          ]}
        />
      </div>
    </>
  );
}
