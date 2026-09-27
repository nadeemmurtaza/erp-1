'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateShort, formatDateTime } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import { DataTable, MetricStrip, PageHeader, EmptyState } from '@/components/ui';

interface LotDetail {
  id: string;
  lotCode: string;
  expiresOn: string | null;
  receivedOn: string;
  sourceReceiptId: string | null;
  variantId: string;
  sku: string;
  label: string;
  totalQuantity: number;
  stocks: Array<{ locationId: string; locationName: string; quantity: number }>;
}

interface RecallAllocation {
  quantity: number;
  allocatedAt: string;
  stockMovementId: string;
  movementCreatedAt: string;
  order: { id: string; number: string; placedAt: string; contactId: string | null } | null;
}

interface RecallResult {
  allocations: RecallAllocation[];
}

interface GenealogyBackward {
  producedByRun: { id: string; number: string };
  inputLots: Array<{ lot: { id: string; lotCode: string }; quantityConsumed: number; rawMaterial: { name: string; variant: { sku: string } } }>;
}

interface GenealogyForwardRow {
  id: string;
  number: string;
  quantityProduced: number;
  producedAt: string;
  quantityConsumedFromThisLot: number;
}

/**
 * 32-lots-batch-expiry-fefo.md WO-32.4, 71-recipe-batch-traceability.md
 * WO-71.4 — one screen: what this lot is, where it still sits, who bought
 * from it (`inventory.recall`, narrower — omitted rather than explained,
 * the same pattern this codebase already uses for cost fields), and its
 * production genealogy both directions.
 */
export default function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAdminSession();
  const canRecall = can('inventory.recall');
  const canViewBom = can('bom.view');

  const [lot, setLot] = useState<LotDetail | null>(null);
  const [recall, setRecall] = useState<RecallResult | null>(null);
  const [backward, setBackward] = useState<GenealogyBackward | null>(null);
  const [forward, setForward] = useState<GenealogyForwardRow[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<LotDetail>(`/admin/inventory/lots/${id}`)
      .then(setLot)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this lot'))
      .finally(() => setBusy(false));
  }, [id]);

  useEffect(() => {
    if (!canRecall) return;
    adminFetch<RecallResult>(`/admin/inventory/lots/${id}/recall`)
      .then(setRecall)
      .catch(() => setRecall(null));
  }, [id, canRecall]);

  useEffect(() => {
    if (!canViewBom) return;
    // 404 here just means this lot was received by purchase, not produced —
    // the ordinary case, not an error.
    adminFetch<GenealogyBackward>(`/admin/bom/lots/${id}/trace-output`)
      .then(setBackward)
      .catch(() => setBackward(null));
    adminFetch<GenealogyForwardRow[]>(`/admin/bom/lots/${id}/trace-forward`)
      .then(setForward)
      .catch(() => setForward([]));
  }, [id, canViewBom]);

  if (busy) {
    return <p className="p-4 text-sm text-neutral-900/60">Loading lot…</p>;
  }

  if (error && !lot) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!lot) return null;

  return (
    <>
      <PageHeader
        title={lot.lotCode}
        description={`${lot.label} · ${lot.sku}`}
        action={
          <Link href="/admin/inventory/lots" className="btn-secondary">
            All lots
          </Link>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="mb-6">
        <MetricStrip
          label="Lot summary"
          items={[
            { key: 'received', label: 'Received', value: formatDateShort(lot.receivedOn) },
            { key: 'expires', label: 'Expires', value: lot.expiresOn ? formatDateShort(lot.expiresOn) : 'No expiry' },
            { key: 'on-hand', label: 'On hand', value: String(lot.totalQuantity) },
          ]}
        />
      </div>

      <h2 className="mb-3 text-lg font-medium text-neutral-900">Stock by location</h2>
      <div className="mb-8 overflow-hidden">
        <DataTable
          rows={lot.stocks}
          rowKey={(row) => row.locationId}
          emptyLabel="No unsold stock remains from this lot."
          columns={[
            { header: 'Location', cell: (row) => row.locationName },
            { header: 'Quantity', numeric: true, align: 'end', cell: (row) => row.quantity },
          ]}
        />
      </div>

      {canViewBom && (backward || (forward && forward.length > 0)) ? (
        <>
          <h2 className="mb-3 text-lg font-medium text-neutral-900">Batch genealogy</h2>
          {backward ? (
            <div className="card mb-4 p-4">
              <p className="mb-2 text-sm font-medium text-neutral-900">
                Produced by{' '}
                <Link href={`/admin/bom/production/${backward.producedByRun.id}`} className="text-accent-hover hover:underline">
                  run {backward.producedByRun.number}
                </Link>
              </p>
              <p className="mb-2 text-xs text-neutral-900/60">Input lots consumed to make this batch:</p>
              <ul className="space-y-1 text-sm">
                {backward.inputLots.map((entry) => (
                  <li key={`${entry.lot.id}-${entry.rawMaterial.variant.sku}`}>
                    <Link href={`/admin/inventory/lots/${entry.lot.id}`} className="text-accent-hover hover:underline">
                      {entry.lot.lotCode}
                    </Link>{' '}
                    <span className="text-neutral-900/60">
                      — {entry.rawMaterial.name} ({entry.rawMaterial.variant.sku}), {entry.quantityConsumed} consumed
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {forward && forward.length > 0 ? (
            <div className="mb-8 overflow-hidden">
              <p className="mb-2 text-xs text-neutral-900/60">Production runs this lot's stock was consumed into:</p>
              <DataTable
                rows={forward}
                rowKey={(row) => row.id}
                emptyLabel="Not consumed by any production run."
                columns={[
                  {
                    header: 'Run',
                    cell: (row) => (
                      <Link href={`/admin/bom/production/${row.id}`} className="font-medium text-accent-hover hover:underline">
                        {row.number}
                      </Link>
                    ),
                  },
                  { header: 'Produced', muted: true, cell: (row) => formatDateShort(row.producedAt) },
                  { header: 'Consumed from this lot', numeric: true, align: 'end', cell: (row) => row.quantityConsumedFromThisLot },
                ]}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {canRecall ? (
        <>
          <h2 className="mb-3 text-lg font-medium text-neutral-900">Recall trail</h2>
          {recall && recall.allocations.length === 0 ? (
            <EmptyState title="No stock movements yet" description="Nothing has been sold or moved from this lot." />
          ) : (
            <div className="overflow-hidden">
              <DataTable
                rows={recall?.allocations ?? []}
                loading={!recall}
                rowKey={(row) => row.stockMovementId}
                emptyLabel="No allocations found."
                columns={[
                  { header: 'Date', muted: true, cell: (row) => formatDateTime(row.movementCreatedAt) },
                  { header: 'Quantity', numeric: true, align: 'end', cell: (row) => row.quantity },
                  {
                    header: 'Order',
                    cell: (row) =>
                      row.order ? (
                        <Link href={`/admin/orders/${row.order.id}`} className="text-accent-hover hover:underline">
                          {row.order.number}
                        </Link>
                      ) : (
                        <span className="text-neutral-900/60">Not a sale</span>
                      ),
                  },
                ]}
              />
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
