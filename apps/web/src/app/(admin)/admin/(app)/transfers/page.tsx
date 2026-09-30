'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import type { Location, StockTransfer, StockTransferListResult } from '@/types/api';
import { DataTable, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

const STATUSES = ['', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'] as const;

/**
 * Inter-branch and org-central stock transfers (RETAIL-ERP.md R4,
 * WO-22.1/22.2/22.3, WO-23.3d). Off by default (`transfers` module) — the
 * nav entry and this page are both invisible for every deployment today
 * (R14). Locations are fetched once so rows can show a name, not a cuid.
 */
export default function TransfersPage() {
  const [transfers, setTransfers] = useState<StockTransfer[] | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<Location[]>('/admin/inventory/locations')
      .then((result) => {
        if (!cancelled) setLocations(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTransfers(null);
    adminFetch<StockTransferListResult>('/admin/transfers', { query: { status: status || undefined } })
      .then((result) => {
        if (!cancelled) setTransfers(result.data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load transfers');
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const locationName = (id: string) => locations.find((location) => location.id === id)?.name ?? id;

  return (
    <>
      <PageHeader
        title="Transfers"
        description="Stock dispatched from one location and received at another — including org-central purchasing pushed down to a brand."
        action={
          <Link href={ROUTES.admin.transferNew} className="btn-primary">
            New transfer
          </Link>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((candidate) => (
          <button
            key={candidate || 'ALL'}
            type="button"
            onClick={() => setStatus(candidate)}
            className={status === candidate ? 'chip bg-inverse text-on-inverse' : 'chip'}
          >
            {candidate || 'All'}
          </button>
        ))}
      </div>

      <DataTable
        rows={transfers}
        loading={transfers === null}
        emptyLabel="No transfers yet — dispatch one to move stock between locations."
        rowKey={(transfer) => transfer.id}
        onRowClick={(transfer) => {
          window.location.href = ROUTES.admin.transfer(transfer.id);
        }}
        columns={[
          {
            header: 'Number',
            cell: (transfer) => (
              <Link href={ROUTES.admin.transfer(transfer.id)} className="font-medium text-accent-hover hover:underline">
                {transfer.number}
              </Link>
            ),
          },
          { header: 'From', cell: (transfer) => locationName(transfer.sourceLocationId), muted: true },
          { header: 'To', cell: (transfer) => locationName(transfer.destinationLocationId), muted: true },
          { header: 'Status', cell: (transfer) => <StatusBadge status={transfer.status} /> },
          { header: 'Settlement', cell: (transfer) => transfer.settlementMode, muted: true },
          {
            header: 'Dispatched',
            cell: (transfer) => formatDateTime(transfer.createdAt),
            align: 'end',
            muted: true,
          },
        ]}
      />
    </>
  );
}
