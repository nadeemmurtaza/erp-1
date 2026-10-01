'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatMoney, formatQuantity, type RawMaterialUnit } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import { DataTable, EmptyState, PageHeader } from '@/components/ui';
import { Select } from '@/components/ui/select';

const RAW_MATERIAL_KINDS = ['fabric', 'trim', 'packaging', 'consumable'] as const;
type RawMaterialKind = (typeof RAW_MATERIAL_KINDS)[number];

interface RawUsageTotal {
  rawMaterialId: string;
  name: string;
  unit: RawMaterialUnit;
  unitScale: number;
  consumedBase: number;
  consumedCost?: number;
  runs: number;
  shareBps: number;
}

interface RawUsageResult {
  totals: RawUsageTotal[];
  bucket: 'day' | 'month';
}

/**
 * Raw-material consumption over time — the "did this actually get used"
 * question a production run's own detail page can't answer on its own.
 * WO-C.4 (ADR-019's precedent again: shipped as a plain endpoint and screen,
 * not the unbuilt Track A report registry).
 */
export default function RawUsagePage() {
  const { can } = useAdminSession();
  const canViewCost = can('inventory.view_cost');

  const [result, setResult] = useState<RawUsageResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState('30');
  const [kind, setKind] = useState<RawMaterialKind | ''>('');

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await adminFetch<RawUsageResult>('/admin/bom/raw-usage', {
          query: { days: Number(days) || 30, kind: kind || undefined },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load raw-material usage');
    } finally {
      setBusy(false);
    }
  }, [days, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Raw-material usage"
        description="What production actually consumed, over time."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div role="group" aria-label="Filter raw-material usage" className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          label="Window"
          value={days}
          onChange={setDays}
          className="w-auto"
          options={[
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' },
            { value: '90', label: 'Last 90 days' },
            { value: '365', label: 'Last year' },
          ]}
        />
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as RawMaterialKind | '')}
          className="field-input w-auto"
          aria-label="Kind"
        >
          <option value="">All kinds</option>
          {RAW_MATERIAL_KINDS.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {!busy && result && result.totals.length === 0 ? (
        <EmptyState
          title="No raw materials consumed in this window"
          description="Record a production run to see what it used here."
        />
      ) : (
        <div className="overflow-hidden">
          <DataTable
            rows={result?.totals}
            loading={busy && !result}
            rowKey={(row) => row.rawMaterialId}
            emptyLabel="No raw materials consumed in this window."
            columns={[
              { header: 'Material', cell: (row) => row.name },
              {
                header: 'Consumed',
                numeric: true,
                align: 'end',
                cell: (row) => formatQuantity(row.consumedBase, row.unitScale, row.unit),
              },
              { header: 'Runs', numeric: true, align: 'end', cell: (row) => row.runs },
              { header: 'Share', numeric: true, align: 'end', cell: (row) => `${(row.shareBps / 100).toFixed(1)}%` },
              ...(canViewCost
                ? [
                    {
                      header: 'Cost',
                      numeric: true,
                      align: 'end' as const,
                      cell: (row: RawUsageTotal) =>
                        row.consumedCost !== undefined ? formatMoney(row.consumedCost) : '—',
                    },
                  ]
                : []),
            ]}
          />
        </div>
      )}
    </>
  );
}
