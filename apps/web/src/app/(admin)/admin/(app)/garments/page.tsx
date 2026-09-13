'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { EmptyState, Loading, PageHeader } from '@/components/ui';
import { Badge } from '@/components/ui';
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

  const load = useCallback(async () => {
    try {
      setGarments(await adminFetch<GarmentWithSizeChart[]>('/admin/measurements/garment-types'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load garment types');
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
      ) : !garments ? (
        <Loading />
      ) : garments.length === 0 ? (
        <EmptyState
          title="No garment types yet"
          description="Garment types come from the catalogue seed. Once one exists it appears here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-flat">
            <thead>
              <tr>
                <th scope="col">Garment</th>
                <th scope="col">Measurements</th>
                <th scope="col" className="text-end">
                  Stitching fee
                </th>
                <th scope="col">Stitching</th>
              </tr>
            </thead>
            <tbody>
              {garments.map((garment) => {
                const active = garment.fields.filter((field) => field.isActive).length;
                return (
                  <tr key={garment.id} className="hover:bg-neutral-50">
                    <td>
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
                      <span className="mt-0.5 block font-urdu text-xs text-neutral-900/45" dir="rtl">
                        {garment.labelUr}
                      </span>
                    </td>
                    <td className="tabular-nums text-neutral-900/70">
                      {active} {active === 1 ? 'field' : 'fields'}
                    </td>
                    <td className="text-end tabular-nums text-neutral-900">
                      {formatMoney(garment.stitchingPrice)}
                    </td>
                    <td>
                      <Badge tone={garment.stitchingEnabled ? 'success' : 'neutral'}>
                        {garment.stitchingEnabled ? 'Offered' : 'Hidden'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
