'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDateShort } from '@newax/shared';
import { PageHeader, DataTable, EmptyState } from '@/components/ui';

interface VariantSearchResult {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  product: { id: string; name: string };
}

interface LotRow {
  id: string;
  lotCode: string;
  expiresOn: string | null;
  receivedOn: string;
  totalQuantity: number;
  stocks: Array<{ locationId: string; locationName: string; quantity: number }>;
}

interface ExpiringLotRow {
  lotId: string;
  lotCode: string;
  expiresOn: string;
  sku: string;
  label: string;
  unsoldQuantity: number;
}

/**
 * 32-lots-batch-expiry-fefo.md WO-32.4. Batch identity has no product-wide
 * list endpoint by design (a lot is a sub-ledger under one variant's stock,
 * doc 32's own framing) — this screen defaults to what needs no variant
 * picked at all (lots nearing expiry, the same candidates the alerting cron
 * reads) and lets a search narrow to one SKU's own lot history.
 */
export default function LotsPage() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<VariantSearchResult[]>([]);
  const [selected, setSelected] = useState<VariantSearchResult | null>(null);

  const [lots, setLots] = useState<LotRow[] | null>(null);
  const [expiring, setExpiring] = useState<ExpiringLotRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<ExpiringLotRow[]>('/admin/inventory/lots/expiring', { query: { withinDays: '30' } })
      .then(setExpiring)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load expiring lots'));
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      adminFetch<{ data: VariantSearchResult[] }>('/admin/inventory', { query: { search } })
        .then((res) => setResults(res.data.slice(0, 8)))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (!selected) {
      setLots(null);
      return;
    }
    adminFetch<LotRow[]>('/admin/inventory/lots', { query: { variantId: selected.id } })
      .then(setLots)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load lots'));
  }, [selected]);

  return (
    <>
      <PageHeader
        title="Lots & batches"
        description="Batch identity as a sub-ledger under stock — expiry, FEFO allocation, and the recall trail."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card relative mb-6 p-4">
        <label htmlFor="lot-variant-search" className="field-label">
          Find a SKU's lots
        </label>
        <input
          id="lot-variant-search"
          className="field-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or SKU…"
        />
        {results.length > 0 ? (
          <ul className="absolute inset-x-4 top-full z-10 mt-1 rounded-md border border-neutral-200 bg-white shadow-md">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-neutral-50"
                  onClick={() => {
                    setSelected(result);
                    setSearch('');
                    setResults([]);
                  }}
                >
                  <span>
                    {result.product.name}
                    {result.size || result.color ? (
                      <span className="ms-1 text-neutral-900/60">
                        ({[result.size, result.color].filter(Boolean).join(' / ')})
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-neutral-900/60">{result.sku}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {selected ? (
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium text-neutral-900">
              {selected.product.name} <span className="text-sm font-normal text-neutral-900/60">{selected.sku}</span>
            </h2>
            <button type="button" className="btn-text text-sm" onClick={() => setSelected(null)}>
              Clear
            </button>
          </div>
          {lots && lots.length === 0 ? (
            <EmptyState title="No lots registered for this SKU" description="Lots are created the first time this variant is received against a lot-tracked purchase order, or produced as a batch." />
          ) : (
            <div className="overflow-hidden">
              <DataTable
                rows={lots}
                loading={!lots}
                rowKey={(lot) => lot.id}
                emptyLabel="No lots found."
                columns={[
                  {
                    header: 'Lot code',
                    cell: (lot) => (
                      <Link href={`/admin/inventory/lots/${lot.id}`} className="font-medium text-accent-hover hover:underline">
                        {lot.lotCode}
                      </Link>
                    ),
                  },
                  { header: 'Received', muted: true, cell: (lot) => formatDateShort(lot.receivedOn) },
                  { header: 'Expires', muted: true, cell: (lot) => (lot.expiresOn ? formatDateShort(lot.expiresOn) : '—') },
                  { header: 'On hand', numeric: true, align: 'end', cell: (lot) => lot.totalQuantity },
                ]}
              />
            </div>
          )}
        </div>
      ) : null}

      <h2 className="mb-3 text-lg font-medium text-neutral-900">Expiring within 30 days</h2>
      {expiring && expiring.length === 0 ? (
        <EmptyState title="Nothing expiring soon" description="Every lot with unsold stock expires more than 30 days out." />
      ) : (
        <div className="overflow-hidden">
          <DataTable
            rows={expiring}
            loading={!expiring}
            rowKey={(row) => row.lotId}
            emptyLabel="No lots found."
            columns={[
              {
                header: 'Lot code',
                cell: (row) => (
                  <Link href={`/admin/inventory/lots/${row.lotId}`} className="font-medium text-accent-hover hover:underline">
                    {row.lotCode}
                  </Link>
                ),
              },
              { header: 'SKU', muted: true, cell: (row) => `${row.label} · ${row.sku}` },
              { header: 'Expires', muted: true, cell: (row) => formatDateShort(row.expiresOn) },
              { header: 'Unsold', numeric: true, align: 'end', cell: (row) => row.unsoldQuantity },
            ]}
          />
        </div>
      )}
    </>
  );
}
