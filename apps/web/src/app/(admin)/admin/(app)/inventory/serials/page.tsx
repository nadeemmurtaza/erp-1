'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { formatDateShort } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { PageHeader, DataTable, EmptyState } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface VariantSearchResult {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  product: { id: string; name: string };
}

interface SerializedUnitRow {
  id: string;
  serialNumber: string;
  status: 'IN_STOCK' | 'SOLD' | 'RETURNED' | 'RMA_TO_SUPPLIER' | 'WRITTEN_OFF';
  locationId: string | null;
  locationName: string | null;
  orderId: string | null;
  createdAt: string;
}

/**
 * 158-serialized-unit-tracking.md WO-158.6. No serial-list endpoint spans
 * every variant (one row per physical unit, unbounded across the whole
 * catalogue) — this screen browses one SKU at a time, the same "find a
 * SKU first" shape the lots screen already uses, plus a direct
 * serial-number lookup for the common staff task: a customer walks in with
 * one unit, not a SKU.
 */
export default function SerialsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<VariantSearchResult[]>([]);
  const [selected, setSelected] = useState<VariantSearchResult | null>(null);
  const [units, setUnits] = useState<SerializedUnitRow[] | null>(null);
  const [lookup, setLookup] = useState('');
  const [error, setError] = useState<string | null>(null);

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
      setUnits(null);
      return;
    }
    adminFetch<SerializedUnitRow[]>('/admin/inventory/serials', { query: { variantId: selected.id } })
      .then(setUnits)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load serial numbers'));
  }, [selected]);

  return (
    <>
      <PageHeader
        title="Serial numbers"
        description="One row per physical unit — status, sale and warranty history."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card mb-6 p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (lookup.trim()) router.push(ROUTES.admin.serial(lookup.trim()));
          }}
          className="flex items-end gap-3"
        >
          <label className="block flex-1">
            <span className="field-label">Look up one serial number</span>
            <input
              className="field-input"
              value={lookup}
              onChange={(event) => setLookup(event.target.value)}
              placeholder="e.g. an IMEI"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={!lookup.trim()}>
            Look up
          </button>
        </form>
      </div>

      <div className="card relative mb-6 p-4">
        <label htmlFor="serial-variant-search" className="field-label">
          Browse a SKU&apos;s serial numbers
        </label>
        <input
          id="serial-variant-search"
          className="field-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or SKU…"
        />
        {results.length > 0 ? (
          <ul className="absolute inset-x-4 top-full z-10 mt-1 rounded-md bg-white shadow-md">
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
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium text-neutral-900">
              {selected.product.name} <span className="text-sm font-normal text-neutral-900/60">{selected.sku}</span>
            </h2>
            <button type="button" className="btn-text text-sm" onClick={() => setSelected(null)}>
              Clear
            </button>
          </div>
          {units && units.length === 0 ? (
            <EmptyState
              title="No serial numbers registered for this SKU"
              description="Serial numbers are entered the first time this variant is received against a serial-tracked purchase order."
            />
          ) : (
            <div className="overflow-hidden">
              <DataTable
                rows={units}
                loading={!units}
                rowKey={(unit) => unit.id}
                emptyLabel="No serial numbers found."
                columns={[
                  {
                    header: 'Serial number',
                    cell: (unit) => (
                      <Link href={ROUTES.admin.serial(unit.serialNumber)} className="font-medium text-accent-hover hover:underline">
                        {unit.serialNumber}
                      </Link>
                    ),
                  },
                  { header: 'Status', cell: (unit) => <StatusBadge status={unit.status} /> },
                  { header: 'Location', muted: true, cell: (unit) => unit.locationName ?? '—' },
                  { header: 'Received', muted: true, cell: (unit) => formatDateShort(unit.createdAt) },
                ]}
              />
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
