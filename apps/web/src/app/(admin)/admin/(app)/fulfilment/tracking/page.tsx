'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { DataTable, MetricStrip, PageHeader, type MetricItem } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface Shipment {
  id: string;
  courier: string;
  trackingNumber: string | null;
  status: string;
  createdAt: string;
  order: { id: string; number: string };
  events: Array<{ status: string; occurredAt: string }>;
}

/**
 * WO-6.8's `/admin/fulfilment/tracking` — every shipment still moving, with
 * how long it's been since its last recorded event. FulfilmentCron polls a
 * real courier every 30 minutes; a `manual` shipment only moves when staff
 * records a status from the Shipments screen, so this is where to notice one
 * that's gone quiet.
 */
export default function TrackingPage() {
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      adminFetch<Shipment[]>('/admin/fulfilment/shipments?status=DISPATCHED'),
      adminFetch<Shipment[]>('/admin/fulfilment/shipments?status=IN_TRANSIT'),
      adminFetch<Shipment[]>('/admin/fulfilment/shipments?status=PENDING'),
    ])
      .then(([dispatched, inTransit, pending]) => setShipments([...dispatched, ...inTransit, ...pending]))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load tracking'));
  }, []);

  const metrics: MetricItem[] = shipments
    ? [
        { key: 'in-flight', label: 'In flight', value: shipments.length },
        {
          key: 'stale',
          label: 'No movement in 3+ days',
          value: shipments.filter((s) => Date.now() - new Date(s.createdAt).getTime() > 3 * 24 * 60 * 60 * 1000).length,
        },
      ]
    : [];

  return (
    <>
      <PageHeader title="Tracking" description="Every shipment still on its way — not yet delivered, returned or lost." />

      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}

      {shipments ? <MetricStrip label="Tracking summary" items={metrics} className="mb-6" /> : null}

      <div className="overflow-hidden">
        <DataTable
          rows={shipments}
          loading={shipments === null}
          rowKey={(row) => row.id}
          emptyLabel="Nothing in flight — every shipment has reached a final status."
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
            { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
            {
              header: 'Last event',
              muted: true,
              cell: (row) => (row.events[0] ? formatDateTime(row.events[0].occurredAt) : formatDateTime(row.createdAt)),
            },
          ]}
        />
      </div>
    </>
  );
}
