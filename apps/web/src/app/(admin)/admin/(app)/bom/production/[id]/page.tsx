'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { formatDateTime, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, MetricStrip, PageHeader } from '@/components/ui';

interface ProductionRunLine {
  id: string;
  rawMaterialId: string;
  name: string;
  sku: string;
  quantityBase: number;
  unitCost: number;
  lineCost: number;
}

interface ProductionRunDetail {
  id: string;
  number: string;
  recipeId: string;
  variantId: string;
  sku: string;
  runs: number;
  quantityProduced: number;
  materialCost: number;
  labourCost: number;
  overheadCost: number;
  producedUnitCost: number;
  notes: string | null;
  producedAt: string;
  lines: ProductionRunLine[];
}

export default function ProductionRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [run, setRun] = useState<ProductionRunDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<ProductionRunDetail>(`/admin/bom/production-runs/${id}`)
      .then(setRun)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the production run'))
      .finally(() => setBusy(false));
  }, [id]);

  if (busy) {
    return <p className="p-4 text-sm text-neutral-900/60">Loading production run…</p>;
  }

  if (error && !run) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!run) return null;

  return (
    <>
      <PageHeader
        title={run.number}
        description={`${run.sku} · ${run.runs} run(s), ${run.quantityProduced} unit(s) produced`}
        context={
          <Link href="/admin/bom/production" className="hover:text-neutral-900">
            ← Production
          </Link>
        }
        action={
          <Link href={`/admin/bom/${run.recipeId}`} className="btn-secondary">
            View recipe
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
          label="Production run summary"
          items={[
            { key: 'produced-at', label: 'Produced', value: formatDateTime(run.producedAt) },
            { key: 'material', label: 'Material cost', value: formatMoney(run.materialCost) },
            { key: 'labour', label: 'Labour + overhead', value: formatMoney(run.labourCost + run.overheadCost) },
            { key: 'unit-cost', label: 'Cost / finished unit', value: formatMoney(run.producedUnitCost) },
          ]}
        />
      </div>

      {run.notes ? <p className="mb-6 text-sm text-neutral-900/70">{run.notes}</p> : null}

      <h2 className="mb-3 text-lg font-medium text-neutral-900">Raw materials consumed</h2>
      <div className="overflow-hidden">
        <DataTable
          rows={run.lines}
          rowKey={(line) => line.id}
          emptyLabel="No lines on this run."
          columns={[
            { header: 'Material', cell: (line) => line.name },
            { header: 'SKU', muted: true, cell: (line) => line.sku },
            { header: 'Base qty consumed', numeric: true, align: 'end', cell: (line) => line.quantityBase },
            { header: 'Unit cost', numeric: true, align: 'end', cell: (line) => formatMoney(line.unitCost) },
            { header: 'Line cost', numeric: true, align: 'end', cell: (line) => formatMoney(line.lineCost) },
          ]}
        />
      </div>
    </>
  );
}
