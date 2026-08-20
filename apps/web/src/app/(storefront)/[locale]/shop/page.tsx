import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { Locale, ProductKind } from '@yaseen/shared';
import { FilterPanel } from '@/components/storefront/filter-panel';
import { ProductsGrid } from '@/components/storefront/products-grid';
import { SortSelect } from '@/components/storefront/sort-select';
import { GridToggleWrapper } from '@/components/storefront/grid-toggle-wrapper';
import { Link } from '@/i18n/navigation';
import { getFacets, getProducts } from '@/lib/api';
import type { ProductListQuery } from '@/lib/api-types';

export const revalidate = 120;

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'shop' });
  return { title: t('title') };
}

/** Reads one query parameter, taking the first value if it repeats. */
function first(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function csv(params: SearchParams, key: string): string[] | undefined {
  const value = first(params, key);
  return value ? value.split(',').filter(Boolean) : undefined;
}

function integer(params: SearchParams, key: string): number | undefined {
  const value = first(params, key);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const search = await searchParams;
  const t = await getTranslations('shop');

  const page = integer(search, 'page') ?? 1;
  const query: ProductListQuery = {
    locale: locale as Locale,
    page,
    pageSize: 24,
    q: first(search, 'q'),
    category: first(search, 'category'),
    kind: first(search, 'kind') as ProductKind | undefined,
    fabric: csv(search, 'fabric'),
    season: csv(search, 'season'),
    pieceCount: csv(search, 'pieceCount'),
    minPrice: integer(search, 'minPrice'),
    maxPrice: integer(search, 'maxPrice'),
    sort: (first(search, 'sort') as ProductListQuery['sort']) ?? 'featured',
  };

  const [products, facets] = await Promise.all([getProducts(query), getFacets()]);

  // Preserve every filter when paging; only the page number changes.
  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) {
      if (typeof value === 'string' && value) next.set(key, value);
    }
    next.set('page', String(target));
    return `/shop?${next.toString()}`;
  };

  return (
    <div className="container-page py-12">
      <div className="flex items-center justify-between gap-4 mb-8 p-4 border border-sand-200 rounded-md bg-sand-50">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-ink/60">
            {t('resultsCount', { count: products.meta.total })}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Suspense fallback={<div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-sand-300" />
            <div className="w-2 h-2 rounded-full bg-sand-300" />
            <div className="w-2 h-2 rounded-full bg-sand-300" />
          </div>}>
            <GridToggleWrapper />
          </Suspense>
          <SortSelect />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <FilterPanel facets={facets} locale={locale as Locale} />
        </aside>

        <div>
          {products.data.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm font-medium text-ink">{t('empty')}</p>
              <p className="mt-1 text-sm text-ink/60">{t('emptyBody')}</p>
            </div>
          ) : (
            <ProductsGrid products={products.data} locale={locale as Locale} />
          )}

          {products.meta.totalPages > 1 ? (
            <nav
              aria-label="Pagination"
              className="mt-8 flex items-center justify-between gap-4"
            >
              {products.meta.hasPrevious ? (
                <Link href={pageHref(page - 1)} className="btn-secondary">
                  {t('previous')}
                </Link>
              ) : (
                <span />
              )}

              <span className="text-sm text-ink/60">
                {t('pageOf', { page, total: products.meta.totalPages })}
              </span>

              {products.meta.hasNext ? (
                <Link href={pageHref(page + 1)} className="btn-secondary">
                  {t('next')}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}
