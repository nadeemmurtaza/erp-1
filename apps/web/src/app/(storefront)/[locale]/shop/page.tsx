import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import type { Locale, ProductKind } from '@newax/shared';
import { FilterPanel } from '@/components/storefront/filter-panel';
import { ShopControls } from '@/components/storefront/shop-controls';
import { Link } from '@/i18n/navigation';
import { getFacets, getProducts } from '@/lib/api';
import { AnimatedSection } from '@/components/storefront/animated-section';
import type { ProductListQuery } from '@/types/api';
import { alternateLanguages, canonicalUrl } from '@/config/seo';

export const revalidate = 120;

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const [t, tSite] = await Promise.all([
    getTranslations({ locale, namespace: 'shop' }),
    getTranslations({ locale, namespace: 'site' }),
  ]);

  return {
    title: t('title'),
    description: tSite('tagline'),
    // Canonicalizes to the bare listing regardless of ?category=/?sort=/etc
    // query params, so filtered views never compete with it as duplicates.
    alternates: {
      canonical: canonicalUrl('/shop', locale),
      languages: alternateLanguages('/shop'),
    },
  };
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
  const visualSlugs = csv(search, 'visualSlugs');
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
    visualSlugs,
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
    // Extra bottom padding on mobile only: the floating pill bottom-nav is
    // `fixed`, so it sits on top of whatever the page renders last (the
    // pagination row) unless the page reserves room for it below md:.
    <div className="container-page pt-6 md:pt-10 md:pb-12 lg:pt-12">
      <div className="grid gap-6 lg:gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:h-fit">
          <AnimatedSection direction="right">
            <FilterPanel facets={facets} locale={locale as Locale} />
          </AnimatedSection>
        </aside>

        <AnimatedSection direction="up" delay={0.1} className="min-w-0">
          <div>
            {products.data.length === 0 ? (
              <>
                <div className="card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div>
                    <h1 className="font-display text-2xl font-semibold text-neutral-900">{t('title')}</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                      {t('resultsCount', { count: products.meta.total })}
                    </p>
                  </div>
                </div>
                <div className="card p-10 text-center">
                  <p className="text-sm font-medium text-neutral-900">
                    {visualSlugs?.length ? t('visualEmpty') : t('empty')}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {visualSlugs?.length ? t('visualEmptyBody') : t('emptyBody')}
                  </p>
                </div>
              </>
            ) : (
              <ShopControls
                products={products.data}
                locale={locale as Locale}
                resultsCount={t('resultsCount', { count: products.meta.total })}
                title={t('title')}
              />
            )}

            {products.meta.totalPages > 1 ? (
              <nav
                aria-label="Pagination"
                className="mt-10 flex items-center justify-between gap-4"
              >
                {products.meta.hasPrevious ? (
                  <Link href={pageHref(page - 1)} className="btn-secondary">
                    {t('previous')}
                  </Link>
                ) : (
                  <span />
                )}

                <span className="text-sm text-neutral-500">
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
        </AnimatedSection>
      </div>
    </div>
  );
}
