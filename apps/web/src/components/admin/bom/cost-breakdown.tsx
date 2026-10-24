'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { DataTable } from '@/components/ui';

interface CostBreakdownComponent {
  rawMaterialId: string;
  name?: string;
  sku?: string;
  isOptional: boolean;
  quantityBase: number;
  effectiveBps: number;
  componentBaseQty: number;
  rawMaterialCostPrice: number;
  componentCost: number;
}

interface CostBreakdown {
  outputQuantity: number;
  labourCost: number;
  overheadCost: number;
  materialCost: number;
  rolledUpUnitCost: number;
  costComplete: boolean;
  components: CostBreakdownComponent[];
}

/**
 * Per-component cost breakdown — a live recompute (GET .../cost), not the
 * cached rolledUpUnitCost shown elsewhere. Only rendered when the caller
 * holds inventory.view_cost; the parent page decides that, this component
 * assumes it already can see cost.
 */
export function CostBreakdown({ recipeId }: { recipeId: string }) {
  const [data, setData] = useState<CostBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<CostBreakdown>(`/admin/bom/recipes/${recipeId}/cost`)
      .then(setData)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the cost breakdown'));
  }, [recipeId]);

  if (error) {
    return (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    );
  }

  if (!data) {
    return <p className="text-sm text-neutral-900/60">Loading cost breakdown…</p>;
  }

  return (
    <div className="space-y-3">
      {!data.costComplete ? (
        <p className="notice notice-info">
          At least one non-optional component has never been received — this cost is an underestimate, not zero.
        </p>
      ) : null}

      <DataTable
        rows={data.components}
        rowKey={(component) => component.rawMaterialId}
        emptyLabel="No components on this recipe."
        columns={[
          { header: 'Material', cell: (component) => component.name ?? component.rawMaterialId },
          { header: 'SKU', muted: true, cell: (component) => component.sku ?? '—' },
          {
            header: 'Optional',
            muted: true,
            cell: (component) => (component.isOptional ? 'Yes' : 'No'),
          },
          {
            header: 'Base qty (with wastage)',
            numeric: true,
            align: 'end',
            cell: (component) => component.componentBaseQty,
          },
          {
            header: 'Unit cost',
            numeric: true,
            align: 'end',
            cell: (component) =>
              component.rawMaterialCostPrice > 0 ? formatMoney(component.rawMaterialCostPrice) : 'Unknown',
          },
          {
            header: 'Line cost',
            numeric: true,
            align: 'end',
            cell: (component) => formatMoney(component.componentCost),
          },
        ]}
      />

      <div className="card p-4 text-sm">
        <div className="flex justify-between py-1">
          <span className="text-neutral-900/60">Material cost</span>
          <span className="tabular-nums text-neutral-900">{formatMoney(data.materialCost)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-neutral-900/60">Labour</span>
          <span className="tabular-nums text-neutral-900">{formatMoney(data.labourCost)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-neutral-900/60">Overhead</span>
          <span className="tabular-nums text-neutral-900">{formatMoney(data.overheadCost)}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-100 py-1 pt-2 font-medium">
          <span className="text-neutral-900">Cost per finished unit</span>
          <span className="tabular-nums text-neutral-900">{formatMoney(data.rolledUpUnitCost)}</span>
        </div>
      </div>
    </div>
  );
}
