'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatDateTime, formatMoney } from '@newax/shared';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import { DataTable, PageHeader } from '@/components/ui';
import type { PaginatedResponse } from '@/types/api';

interface ProductionRunRow {
  id: string;
  number: string;
  recipeId: string;
  variantId: string;
  sku: string;
  runs: number;
  quantityProduced: number;
  producedUnitCost: number;
  producedAt: string;
}

/** Production runs — ledger history, never deleted. */
export default function ProductionRunsPage() {
  const canProduce = getStoredUser()?.permissions.includes('bom.produce') ?? false;

  const [rows, setRows] = useState<PaginatedResponse<ProductionRunRow> | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRows(
        await adminFetch<PaginatedResponse<ProductionRunRow>>('/admin/bom/production-runs', {
          query: { page, pageSize: 20 },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load production runs');
    } finally {
      setBusy(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Production"
        description="Runs that consumed raw materials and credited finished stock."
        action={
          canProduce ? (
            <Link href="/admin/bom/production/new" className="btn-primary">
              Record a run
            </Link>
          ) : undefined
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        <DataTable
          rows={rows?.data}
          loading={busy && !rows}
          rowKey={(row) => row.id}
          emptyLabel="No production runs yet."
          columns={[
            {
              header: 'Run',
              cell: (row) => (
                <Link href={`/admin/bom/production/${row.id}`} className="font-medium text-neutral-900 hover:text-accent-hover">
                  {row.number}
                </Link>
              ),
            },
            { header: 'Product SKU', muted: true, cell: (row) => row.sku },
            { header: 'Runs', numeric: true, align: 'end', cell: (row) => row.runs },
            { header: 'Quantity produced', numeric: true, align: 'end', cell: (row) => row.quantityProduced },
            {
              header: 'Cost / unit',
              numeric: true,
              align: 'end',
              cell: (row) => formatMoney(row.producedUnitCost),
            },
            { header: 'Produced', muted: true, cell: (row) => formatDateTime(row.producedAt) },
          ]}
        />

        {rows && rows.meta.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm">
            <button
              type="button"
              className="btn-ghost"
              disabled={!rows.meta.hasPrevious}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <span className="text-neutral-900/60">
              Page {rows.meta.page} of {rows.meta.totalPages} · {rows.meta.total} runs
            </span>
            <button
              type="button"
              className="btn-ghost"
              disabled={!rows.meta.hasNext}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
