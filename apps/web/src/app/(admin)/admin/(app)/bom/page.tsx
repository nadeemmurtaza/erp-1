'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, MetricStrip, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import type { PaginatedResponse } from '@/types/api';
import { useAdminSession } from '@/components/admin/session';
import { Select } from '@/components/ui/select';

type BomStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
type RecipeFilter = 'all' | 'active' | 'missing' | 'incomplete-cost';

interface RecipeRow {
  id: string;
  variantId: string;
  sku: string;
  label: string | null;
  status: BomStatus;
  version: number;
  outputQuantity: number;
  componentCount: number;
  rolledUpUnitCost?: number;
  costComplete?: boolean;
  costComputedAt?: string | null;
  updatedAt: string;
}

interface MissingRow {
  id: string;
  sku: string;
  productId: string;
}

interface MissingSummary {
  counts: { missing: number; incompleteCost: number };
}

/**
 * Recipes — which raw materials go into a finished product, and the cost
 * that rolls up to. The "missing"/"incomplete-cost" filters are the same two
 * buckets GET /admin/bom/missing surfaces: a recipe that should exist but
 * doesn't, and one that exists but whose cost cannot be trusted yet.
 */
export default function RecipesPage() {
  const { can } = useAdminSession();
  const canManage = can('bom.manage');
  const canViewCost = can('inventory.view_cost');

  const [rows, setRows] = useState<PaginatedResponse<RecipeRow | MissingRow> | null>(null);
  const [summary, setSummary] = useState<MissingSummary | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<RecipeFilter>('all');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [recipesRes, missingRes] = await Promise.all([
        adminFetch<PaginatedResponse<RecipeRow | MissingRow>>('/admin/bom/recipes', {
          query: { q: q || undefined, filter, page, pageSize: 20 },
        }),
        adminFetch<MissingSummary>('/admin/bom/missing'),
      ]);
      setRows(recipesRes);
      setSummary(missingRes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load recipes');
    } finally {
      setBusy(false);
    }
  }, [q, filter, page]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const isMissingFilter = filter === 'missing';

  return (
    <>
      <PageHeader
        title="Recipes"
        description="Which raw materials go into a finished product, and what that makes it cost."
        action={
          canManage ? (
            <Link href="/admin/bom/new" className="btn-primary">
              New recipe
            </Link>
          ) : undefined
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {summary ? (
        <div className="mb-6">
          <MetricStrip
            label="Recipe coverage"
            items={[
              {
                key: 'missing',
                label: 'Missing recipes',
                value: summary.counts.missing,
              },
              {
                key: 'incomplete-cost',
                label: 'Incomplete cost',
                value: summary.counts.incompleteCost,
              },
            ]}
          />
        </div>
      ) : null}

      <div role="group" aria-label="Filter recipes" className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(event) => {
            setPage(1);
            setQ(event.target.value);
          }}
          placeholder="Search SKU or name…"
          className="field-input w-auto flex-1"
          aria-label="Search"
          disabled={isMissingFilter}
        />
        <Select
          label="Filter"
          value={filter}
          onChange={(next) => {
            setPage(1);
            setFilter(next as RecipeFilter);
          }}
          className="w-auto"
          options={[
            { value: 'all', label: 'All recipes' },
            { value: 'active', label: 'Active' },
            { value: 'missing', label: 'Missing' },
            { value: 'incomplete-cost', label: 'Incomplete cost' },
          ]}
        />
      </div>

      <div className="overflow-hidden">
        {isMissingFilter ? (
          <DataTable
            rows={rows?.data as MissingRow[] | undefined}
            loading={busy && !rows}
            rowKey={(row) => row.id}
            emptyLabel="Nothing missing a recipe."
            columns={[
              { header: 'SKU', cell: (row) => row.sku },
              {
                header: '',
                align: 'end',
                cell: (row) => (
                  <Link href={`/admin/bom/new?variantId=${row.id}`} className="text-xs text-accent-hover hover:underline">
                    Create recipe
                  </Link>
                ),
              },
            ]}
          />
        ) : (
          <DataTable
            rows={rows?.data as RecipeRow[] | undefined}
            loading={busy && !rows}
            rowKey={(row) => row.id}
            emptyLabel="No recipes match those filters."
            columns={[
              {
                header: 'SKU',
                cell: (row) => (
                  <Link href={`/admin/bom/${row.id}`} className="font-medium text-neutral-900 hover:text-accent-hover">
                    {row.sku}
                  </Link>
                ),
              },
              { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
              { header: 'Components', muted: true, numeric: true, align: 'end', cell: (row) => row.componentCount },
              ...(canViewCost
                ? [
                    {
                      header: 'Cost',
                      numeric: true,
                      align: 'end' as const,
                      cell: (row: RecipeRow) =>
                        row.rolledUpUnitCost !== undefined ? (
                          <>
                            {formatMoney(row.rolledUpUnitCost)}
                            {row.costComplete === false ? (
                              <span className="ms-1 text-xs text-amber-600">(incomplete)</span>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        ),
                    },
                  ]
                : []),
              {
                header: 'Updated',
                muted: true,
                cell: (row) => formatDate(row.updatedAt),
              },
            ]}
          />
        )}

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
              Page {rows.meta.page} of {rows.meta.totalPages} · {rows.meta.total} recipes
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
