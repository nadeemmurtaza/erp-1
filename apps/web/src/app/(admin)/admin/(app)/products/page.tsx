'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { formatMoney, PRODUCT_KINDS, PRODUCT_STATUSES } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import type { AdminProduct, PaginatedResponse } from '@/types/api';
import { ROUTES } from '@/constants/routes';
import { DataTable, FilterBar, Pagination, useFilterPage, useFilterParam, useSetFilterPage } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';

const KIND_LABELS: Record<string, string> = {
  STITCHED: 'Ready to wear',
  UNSTITCHED: 'Unstitched fabric',
  STITCHING_SERVICE: 'Stitching service',
};

/** Matches Setting `bom.raw_material_category_slug`'s seeded value (seed.ts's
 * seedRawMaterialCategory). Raw materials have their own screen
 * (/admin/bom/raw-materials) — this list is finished goods and services. */
const RAW_MATERIAL_CATEGORY_SLUG = 'raw-materials';

export default function AdminProductsPage() {
  const [products, setProducts] = useState<PaginatedResponse<AdminProduct> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const q = useFilterParam('q');
  const kind = useFilterParam('kind');
  const status = useFilterParam('status');
  const page = useFilterPage();
  const setPage = useSetFilterPage();

  const { can } = useAdminSession();
  const canViewInsights = can('analytics.view');

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setProducts(
        await adminFetch<PaginatedResponse<AdminProduct>>('/admin/catalog/products', {
          query: { q: q || undefined, kind: kind || undefined, status: status || undefined, page, pageSize: 20 },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load products');
    } finally {
      setBusy(false);
    }
  }, [q, kind, status, page]);

  useEffect(() => {
    // No debounce needed here: FilterBar already debounces the search box
    // before it touches the URL, so `q` only changes once typing settles.
    load();
  }, [load]);

  const visibleProducts = (products?.data ?? []).filter(
    (product) => product.category?.slug !== RAW_MATERIAL_CATEGORY_SLUG,
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Products &amp; services</h1>
          <p className="mt-1 text-sm text-neutral-900/60">
            Ready-to-wear, unstitched fabric and the stitching services you sell.
          </p>
        </div>
        <div className="flex gap-2">
          {canViewInsights ? (
            <Link href={ROUTES.admin.productInsights} className="btn-secondary">
              Insights
            </Link>
          ) : null}
          <Link href={ROUTES.admin.import} className="btn-secondary">
            Bulk import
          </Link>
          <Link href={ROUTES.admin.productNew} className="btn-primary">
            Add product
          </Link>
        </div>
      </div>

      <FilterBar
        filters={[
          { key: 'q', type: 'search', placeholder: 'Search name, slug or SKU' },
          {
            key: 'kind',
            type: 'select',
            placeholder: 'All kinds',
            options: PRODUCT_KINDS.map((option) => ({ value: option, label: KIND_LABELS[option] ?? option })),
          },
          {
            key: 'status',
            type: 'select',
            placeholder: 'All statuses',
            options: PRODUCT_STATUSES.map((option) => ({
              value: option,
              label: option.charAt(0) + option.slice(1).toLowerCase(),
            })),
          },
        ]}
      />

      {error ? (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        <DataTable
          rows={products ? visibleProducts : null}
          loading={busy && !products}
          emptyLabel="No products match those filters."
          rowKey={(product) => product.id}
          columns={[
            {
              header: 'Product',
              cell: (product) => (
                <>
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="font-medium text-neutral-900 hover:text-accent-hover"
                  >
                    {product.translations.find((t) => t.locale === 'en')?.name ?? product.slug}
                  </Link>
                  <p className="text-xs text-neutral-900/60">{product.slug}</p>
                </>
              ),
            },
            { header: 'Kind', cell: (product) => KIND_LABELS[product.kind], muted: true },
            { header: 'Status', cell: (product) => <StatusBadge status={product.status} /> },
            {
              header: 'Price',
              align: 'end',
              numeric: true,
              cell: (product) => formatMoney(product.basePrice),
            },
            {
              header: 'Stock',
              align: 'end',
              numeric: true,
              cell: (product) => (
                <span
                  className={cn(
                    product.kind === 'STITCHING_SERVICE'
                      ? 'text-neutral-900/60'
                      : product.totalStock === 0
                        ? 'font-medium text-red-700'
                        : product.lowStockVariants > 0
                          ? 'font-medium text-amber-600'
                          : 'text-neutral-900/70',
                  )}
                >
                  {product.kind === 'STITCHING_SERVICE' ? '—' : product.totalStock}
                </span>
              ),
            },
          ]}
        />

        {products ? <Pagination meta={products.meta} onChange={setPage} itemLabel="products" /> : null}
      </div>
    </>
  );
}
