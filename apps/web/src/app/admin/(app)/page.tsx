'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatMoney } from '@yaseen/shared';
import { adminFetch } from '@/lib/admin-client';
import type { AdminProduct, PaginatedResponse } from '@/lib/api-types';

interface Overview {
  total: number;
  active: number;
  drafts: number;
  services: number;
  unstitched: number;
  outOfStock: AdminProduct[];
  lowStock: AdminProduct[];
  recent: AdminProduct[];
  inventoryValue: number;
}

/**
 * Catalogue overview.
 *
 * Deliberately built from the catalogue endpoints that exist today. Orders,
 * revenue, tailoring jobs and CRM follow-ups join this page when their modules
 * land — the tile grid is the seam they slot into.
 */
export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    adminFetch<PaginatedResponse<AdminProduct>>('/admin/catalog/products', {
      query: { pageSize: 100 },
    })
      .then((response) => {
        if (cancelled) return;
        setOverview(summarise(response.data));
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load the catalogue');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink/60">Where the catalogue stands right now.</p>
        </div>
        <Link href="/admin/products/new" className="btn-primary">
          Add product
        </Link>
      </div>

      {error ? (
        <p role="alert" className="card p-4 text-sm text-red-700">
          {error}
        </p>
      ) : !overview ? (
        <p className="text-sm text-ink/50">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Live products" value={overview.active} />
            <Stat label="Drafts" value={overview.drafts} hint="Not visible to customers" />
            <Stat label="Stitching services" value={overview.services} />
            <Stat
              label="Stock value"
              value={formatMoney(overview.inventoryValue)}
              hint="Live products, at list price"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Panel
              title="Low or no stock"
              empty="Every live variant has stock."
              action={{ label: 'All products', href: '/admin/products' }}
            >
              {[...overview.outOfStock, ...overview.lowStock].slice(0, 8).map((product) => (
                <Row
                  key={product.id}
                  href={`/admin/products/${product.id}`}
                  title={nameOf(product)}
                  // A product with stock left is here because one of its
                  // variants is low, so name that rather than the total.
                  meta={
                    product.totalStock === 0
                      ? 'Out of stock'
                      : `${product.lowStockVariants} variant${
                          product.lowStockVariants === 1 ? '' : 's'
                        } low`
                  }
                  tone={product.totalStock === 0 ? 'danger' : 'warn'}
                />
              ))}
            </Panel>

            <Panel
              title="Recently updated"
              empty="Nothing has been edited yet."
              action={{ label: 'Add product', href: '/admin/products/new' }}
            >
              {overview.recent.map((product) => (
                <Row
                  key={product.id}
                  href={`/admin/products/${product.id}`}
                  title={nameOf(product)}
                  meta={`${product.status.toLowerCase()} · ${formatMoney(product.basePrice)}`}
                />
              ))}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

function summarise(products: AdminProduct[]): Overview {
  const live = products.filter((product) => product.status === 'ACTIVE');
  const stockable = live.filter((product) => product.kind !== 'STITCHING_SERVICE');

  return {
    total: products.length,
    active: live.length,
    drafts: products.filter((product) => product.status === 'DRAFT').length,
    services: products.filter((product) => product.kind === 'STITCHING_SERVICE').length,
    unstitched: products.filter((product) => product.kind === 'UNSTITCHED').length,
    outOfStock: stockable.filter((product) => product.totalStock === 0),
    lowStock: stockable.filter(
      (product) => product.totalStock > 0 && product.lowStockVariants > 0,
    ),
    recent: [...products]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8),
    inventoryValue: stockable.reduce(
      (sum, product) => sum + product.basePrice * product.totalStock,
      0,
    ),
  };
}

function nameOf(product: AdminProduct): string {
  return (
    product.translations.find((translation) => translation.locale === 'en')?.name ??
    product.slug
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-sm text-ink/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink/40">{hint}</p> : null}
    </div>
  );
}

function Panel({
  title,
  children,
  empty,
  action,
}: {
  title: string;
  children: React.ReactNode;
  empty: string;
  action?: { label: string; href: string };
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(items) ? items.length === 0 : !items;

  return (
    <section className="card">
      <div className="flex items-center justify-between border-b border-sand-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action ? (
          <Link href={action.href} className="text-xs font-medium text-brand-700 hover:underline">
            {action.label}
          </Link>
        ) : null}
      </div>
      {isEmpty ? (
        <p className="px-4 py-6 text-sm text-ink/50">{empty}</p>
      ) : (
        <ul className="divide-y divide-sand-100">{items}</ul>
      )}
    </section>
  );
}

function Row({
  href,
  title,
  meta,
  tone,
}: {
  href: string;
  title: string;
  meta: string;
  tone?: 'warn' | 'danger';
}) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-sand-50">
        <span className="truncate text-sm text-ink">{title}</span>
        <span
          className={
            tone === 'danger'
              ? 'shrink-0 text-xs font-medium text-red-700'
              : tone === 'warn'
                ? 'shrink-0 text-xs font-medium text-gold'
                : 'shrink-0 text-xs capitalize text-ink/50'
          }
        >
          {meta}
        </span>
      </Link>
    </li>
  );
}
