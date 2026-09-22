'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import type { ProductsCategories, ProductsSlowSellers, ProductsTopSellers } from '@/types/api';
import { DataTable, EmptyState, Loading, PageHeader, Section, Tabs } from '@/components/ui';

/**
 * WO-D.3 (10-admin-dashboard.md Track D) — which products earn their shelf
 * space, which don't, and where revenue concentrates by category. Ships
 * against the live "one endpoint, one screen" idiom (ADR-019/020), not
 * Track A's unbuilt report-registry catalog — `<Money>`, the primitive the
 * source doc names, was never built either; `formatMoney` (already the
 * live idiom everywhere else) stands in for it here too.
 */
export default function ProductInsightsPage() {
  const [topSellers, setTopSellers] = useState<ProductsTopSellers | null>(null);
  const [slowSellers, setSlowSellers] = useState<ProductsSlowSellers | null>(null);
  const [categories, setCategories] = useState<ProductsCategories | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [topData, slowData, categoryData] = await Promise.all([
        adminFetch<ProductsTopSellers>('/admin/analytics/products/top-sellers', { query: { days: 30 } }),
        adminFetch<ProductsSlowSellers>('/admin/analytics/products/slow-sellers'),
        adminFetch<ProductsCategories>('/admin/analytics/products/categories', { query: { days: 30 } }),
      ]);
      setTopSellers(topData);
      setSlowSellers(slowData);
      setCategories(categoryData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load product insights');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <>
        <PageHeader title="Product insights" description="Best sellers, slow movers, and where revenue concentrates by category." />
        <p role="alert" className="text-sm text-feedback-negative">
          {error}
        </p>
      </>
    );
  }

  if (!topSellers || !slowSellers || !categories) {
    return (
      <>
        <PageHeader title="Product insights" description="Best sellers, slow movers, and where revenue concentrates by category." />
        <Loading />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Product insights" description="Best sellers, slow movers, and where revenue concentrates by category." />

      <Tabs
        label="Product insight areas"
        items={[
          {
            key: 'top-sellers',
            label: 'Top sellers',
            content: (
              <Section title="Best sellers by revenue · last 30 days">
                {topSellers.rows.length === 0 ? (
                  <EmptyState title="No sales in this window" />
                ) : (
                  <DataTable
                    rows={topSellers.rows}
                    rowKey={(row, index) => row.variantId ?? `${row.sku}-${index}`}
                    columns={[
                      {
                        header: 'Product',
                        cell: (row) =>
                          row.productId ? (
                            <Link href={`/admin/products/${row.productId}`} className="font-medium text-accent-hover hover:underline">
                              {row.name}
                            </Link>
                          ) : (
                            row.name
                          ),
                      },
                      { header: 'SKU', cell: (row) => row.sku, muted: true },
                      { header: 'Units', cell: (row) => row.units, align: 'end', numeric: true },
                      { header: 'Revenue', cell: (row) => formatMoney(row.revenue), align: 'end', numeric: true },
                      {
                        header: 'Margin',
                        cell: (row) => (row.marginBps === undefined ? '—' : `${(row.marginBps / 100).toFixed(0)}%`),
                        align: 'end',
                        numeric: true,
                        muted: true,
                      },
                    ]}
                  />
                )}
              </Section>
            ),
          },
          {
            key: 'slow-sellers',
            label: 'Slow sellers',
            content: (
              <Section title="Slow movers" description="In stock, active, and flagged by last night's stats run — oldest first.">
                {slowSellers.rows.length === 0 ? (
                  <EmptyState title="No slow movers right now" description="Every active, in-stock variant is selling within its expected pace." />
                ) : (
                  <DataTable
                    rows={slowSellers.rows}
                    rowKey={(row) => row.variantId}
                    columns={[
                      {
                        header: 'Product',
                        cell: (row) => (
                          <Link href={`/admin/products/${row.productId}`} className="font-medium text-accent-hover hover:underline">
                            {row.name}
                          </Link>
                        ),
                      },
                      { header: 'SKU', cell: (row) => row.sku, muted: true },
                      { header: 'Last sold', cell: (row) => `${row.daysSinceLastSale}d ago`, align: 'end', numeric: true },
                      { header: 'Age', cell: (row) => `${row.ageDays}d`, align: 'end', numeric: true, muted: true },
                    ]}
                  />
                )}
              </Section>
            ),
          },
          {
            key: 'categories',
            label: 'Categories',
            content: (
              <Section title="Revenue by category · last 30 days">
                {categories.rows.length === 0 ? (
                  <EmptyState title="No sales in this window" />
                ) : (
                  <DataTable
                    rows={categories.rows}
                    rowKey={(row) => row.categoryId ?? 'uncategorised'}
                    columns={[
                      { header: 'Category', cell: (row) => row.name },
                      { header: 'Revenue', cell: (row) => formatMoney(row.revenue), align: 'end', numeric: true },
                      { header: 'Units', cell: (row) => row.units, align: 'end', numeric: true, muted: true },
                      { header: 'Products', cell: (row) => row.productCount, align: 'end', numeric: true, muted: true },
                      { header: 'Share', cell: (row) => `${(row.share / 100).toFixed(1)}%`, align: 'end', numeric: true },
                    ]}
                  />
                )}
              </Section>
            ),
          },
        ]}
      />
    </>
  );
}
