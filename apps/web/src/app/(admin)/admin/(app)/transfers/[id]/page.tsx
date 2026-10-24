'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import { formatDateTime, formatMoney } from '@newax/shared';
import type { Location, StockTransfer, StockTransferLine } from '@/types/api';
import { DataTable, Loading, PageHeader, Section } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

/**
 * One transfer — its lines, where it stands, and the one action that
 * matters while `IN_TRANSIT`: receive it. A short receipt (entering less
 * than what was dispatched) writes the difference off automatically on the
 * API side (RETAIL-ERP.md R4) — this screen just collects the override.
 */
export default function TransferDetailPage() {
  const params = useParams<{ id: string }>();
  const [transfer, setTransfer] = useState<StockTransfer | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { can } = useAdminSession();

  const canManage = can('transfers.manage');

  const load = useCallback(async () => {
    try {
      const [transferResult, locationsResult] = await Promise.all([
        adminFetch<StockTransfer>(`/admin/transfers/${params.id}`),
        adminFetch<Location[]>('/admin/inventory/locations'),
      ]);
      setTransfer(transferResult);
      setLocations(locationsResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this transfer');
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function receive() {
    if (!transfer) return;
    setBusy(true);
    setError(null);
    try {
      const lines = transfer.lines
        .filter((line) => overrides[line.id] !== undefined && overrides[line.id] !== line.quantityDispatched)
        .map((line) => ({ lineId: line.id, quantityReceived: overrides[line.id] }));
      await adminFetch(`/admin/transfers/${transfer.id}/receive`, { method: 'POST', body: { lines } });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not receive this transfer');
    } finally {
      setBusy(false);
    }
  }

  const locationName = (id: string) => locations.find((location) => location.id === id)?.name ?? id;

  if (error) {
    return (
      <p role="alert" className="text-sm text-feedback-negative">
        {error}
      </p>
    );
  }

  if (!transfer) return <Loading />;

  return (
    <>
      <PageHeader
        title={transfer.number}
        description={`${locationName(transfer.sourceLocationId)} → ${locationName(transfer.destinationLocationId)}`}
        action={<StatusBadge status={transfer.status} />}
      />

      <Section title="Lines">
        <DataTable
          rows={transfer.lines}
          rowKey={(line) => line.id}
          columns={[
            {
              header: 'Variant',
              className: 'font-medium text-neutral-900',
              cell: (line) => line.variantId,
            },
            {
              header: 'Dispatched',
              align: 'end',
              cell: (line) => line.quantityDispatched,
            },
            {
              header: 'Received',
              align: 'end',
              cell: (line) => line.quantityReceived,
            },
            ...(transfer.status === 'IN_TRANSIT' && canManage
              ? [
                  {
                    header: 'Receive as',
                    align: 'end' as const,
                    cell: (line: StockTransferLine) => (
                      <input
                        type="number"
                        min={0}
                        max={line.quantityDispatched}
                        className="field-input w-20 text-end"
                        placeholder={String(line.quantityDispatched)}
                        value={overrides[line.id] ?? ''}
                        onChange={(event) =>
                          setOverrides({
                            ...overrides,
                            [line.id]:
                              event.target.value === ''
                                ? line.quantityDispatched
                                : parseInt(event.target.value, 10),
                          })
                        }
                      />
                    ),
                  },
                ]
              : []),
            {
              header: 'Unit cost',
              align: 'end',
              muted: true,
              cell: (line) => (line.unitCost !== null ? formatMoney(line.unitCost) : '—'),
            },
          ]}
        />
      </Section>

      <Section title="Settlement">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-neutral-900/60">Mode</dt>
            <dd className="text-neutral-900">{transfer.settlementMode}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-900/60">Dispatched</dt>
            <dd className="text-neutral-900">{formatDateTime(transfer.createdAt)}</dd>
          </div>
          {transfer.receivedAt ? (
            <div>
              <dt className="text-xs text-neutral-900/60">Received</dt>
              <dd className="text-neutral-900">{formatDateTime(transfer.receivedAt)}</dd>
            </div>
          ) : null}
        </dl>

        {transfer.interBranchInvoice ? (
          <p className="mt-4 text-sm text-neutral-900">
            Inter-branch invoice <span className="font-medium">{transfer.interBranchInvoice.number}</span> raised for{' '}
            {formatMoney(transfer.interBranchInvoice.amountMinor)}.
          </p>
        ) : null}

        {transfer.note ? <p className="mt-4 text-sm text-neutral-900/70">{transfer.note}</p> : null}
      </Section>

      {transfer.status === 'IN_TRANSIT' ? (
        canManage ? (
          <button type="button" disabled={busy} onClick={() => void receive()} className="btn-primary">
            {busy ? 'Receiving…' : 'Receive'}
          </button>
        ) : (
          <p className="text-sm text-neutral-900/60">Read-only — receiving this needs the transfers.manage permission.</p>
        )
      ) : null}
    </>
  );
}
