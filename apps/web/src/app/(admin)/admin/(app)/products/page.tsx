'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { formatMoney, PRODUCT_KINDS, PRODUCT_STATUSES } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import type { AdminProduct, PaginatedResponse } from '@/types/api';
import { ROUTES } from '@/constants/routes';
import { Loading } from '@/components/ui';
import { StatusBadge } from '@/components/admin/status-badge';

const KIND_LABELS: Record<string, string> = {
  STITCHED: 'Ready to wear',
  UNSTITCHED: 'Unstitched fabric',
  STITCHING_SERVICE: 'Stitching service',
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<PaginatedResponse<AdminProduct> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

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
    // Debounced so typing in the search box does not fire a request per keystroke.
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

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
          <Link href={ROUTES.admin.import} className="btn-secondary">
            Bulk import
          </Link>
          <Link href={ROUTES.admin.productNew} className="btn-primary">
            Add product
          </Link>
        </div>
      </div>

      <div className="card mb-4 flex flex-wrap gap-3 p-3">
        <input
          type="search"
          placeholder="Search name, slug or SKU"
          value={q}
          onChange={(event) => {
            setPage(1);
            setQ(event.target.value);
          }}
          className="field-input max-w-xs"
        />
        <select
          value={kind}
          onChange={(event) => {
            setPage(1);
            setKind(event.target.value);
          }}
          className="field-input w-auto"
        >
          <option value="">All kinds</option>
          {PRODUCT_KINDS.map((option) => (
            <option key={option} value={option}>
              {KIND_LABELS[option]}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value);
          }}
          className="field-input w-auto"
        >
          <option value="">All statuses</option>
          {PRODUCT_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option.charAt(0) + option.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p role="alert" className="card p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-start">
              <tr>
                <Th>Product</Th>
                <Th>Kind</Th>
                <Th>Status</Th>
                <Th className="text-end">Price</Th>
                <Th className="text-end">Stock</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white">
              {busy && !products ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <Loading className="p-0" />
                  </td>
                </tr>
              ) : products && products.data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-900/50">
                    No products match those filters.
                  </td>
                </tr>
              ) : (
                products?.data.map((product) => (
                  <tr key={product.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="font-medium text-neutral-900 hover:text-accent-hover"
                      >
                        {product.translations.find((t) => t.locale === 'en')?.name ??
                          product.slug}
                      </Link>
                      <p className="text-xs text-neutral-900/40">{product.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-neutral-900/70">{KIND_LABELS[product.kind]}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={product.status} />
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-neutral-900">
                      {formatMoney(product.basePrice)}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-end tabular-nums',
                        product.kind === 'STITCHING_SERVICE'
                          ? 'text-neutral-900/30'
                          : product.totalStock === 0
                            ? 'font-medium text-red-700'
                            : product.lowStockVariants > 0
                              ? 'font-medium text-amber-600'
                              : 'text-neutral-900/70',
                      )}
                    >
                      {product.kind === 'STITCHING_SERVICE' ? '—' : product.totalStock}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {products && products.meta.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm">
            <button
              type="button"
              className="btn-ghost"
              disabled={!products.meta.hasPrevious}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <span className="text-neutral-900/60">
              Page {products.meta.page} of {products.meta.totalPages} · {products.meta.total}{' '}
              products
            </span>
            <button
              type="button"
              className="btn-ghost"
              disabled={!products.meta.hasNext}
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn('px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-neutral-900/50', className)}
    >
      {children}
    </th>
  );
}

