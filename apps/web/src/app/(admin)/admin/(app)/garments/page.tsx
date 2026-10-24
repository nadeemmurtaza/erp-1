'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { Badge, DataTable, PageHeader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import type { GarmentWithSizeChart } from '@/utils/garment-drafts';

/**
 * Every garment the tailor can be asked for.
 *
 * This page and the editor used to be one: a picker down the left, a
 * fifteen-field form to the right, and a size-chart table under that. Three
 * jobs sharing a scroll position, and no way to see the garments as a set —
 * which is the question this page exists to answer. Is anything priced
 * wrongly? Is something still hidden from customers?
 *
 * So the list is the overview and the garment is its own page. That is the
 * same shape as products and orders, which is the point: an admin who has
 * opened one list knows how the next one works.
 */
export default function AdminGarmentsPage() {
  const [garments, setGarments] = useState<GarmentWithSizeChart[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setGarments(await adminFetch<GarmentWithSizeChart[]>('/admin/measurements/garment-types'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load garment types');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Garments"
        description="What the tailor needs for each one. Changes apply everywhere immediately."
      />

      {error ? (
        <p role="alert" className="text-sm text-feedback-negative">
          {error}
        </p>
      ) : null}

      <DataTable
        rows={garments}
        loading={busy && !garments}
        emptyLabel="No garment types yet. Garment types come from the catalogue seed. Once one exists it appears here."
        rowKey={(garment) => garment.id}
        columns={[
          {
            header: 'Garment',
            cell: (garment) => (
              <>
                {/*
                 * The link is on the name rather than the row: a whole
                 * clickable row cannot be reached by keyboard, and
                 * cannot be opened in a new tab.
                 */}
                <Link
                  href={ROUTES.admin.garment(garment.id)}
                  className="font-medium text-neutral-900 hover:text-accent-hover"
                >
                  {garment.labelEn}
                </Link>
                {/*
                 * inline-block, not block. `dir="rtl"` is right for the
                 * text — it shapes the parentheses in "کرتا (مردانہ)"
                 * correctly — but on a block it also drags the name to
                 * the far edge of the cell, stranding it half a column
                 * away from the English one it belongs to. Shrunk to its
                 * content, it sits where the eye expects.
                 */}
                <span className="mt-0.5 block w-fit font-urdu text-xs text-neutral-900/60" dir="rtl">
                  {garment.labelUr}
                </span>
              </>
            ),
          },
          {
            header: 'Measurements',
            muted: true,
            numeric: true,
            cell: (garment) => {
              const active = garment.fields.filter((field) => field.isActive).length;
              return (
                <>
                  {active} {active === 1 ? 'field' : 'fields'}
                </>
              );
            },
          },
          {
            header: 'Stitching fee',
            align: 'end',
            numeric: true,
            cell: (garment) => formatMoney(garment.stitchingPrice),
          },
          {
            header: 'Stitching',
            cell: (garment) => (
              <Badge tone={garment.stitchingEnabled ? 'success' : 'neutral'}>
                {garment.stitchingEnabled ? 'Offered' : 'Hidden'}
              </Badge>
            ),
          },
        ]}
      />
    </>
  );
}
