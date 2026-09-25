import type {
  CatalogFacets,
  CategoryNode,
  CmsBanner,
  CmsMenuLink,
  CmsPage,
  CmsPost,
  PaginatedResponse,
  ProductListQuery,
  StorefrontProduct,
} from '@/types/api';

import { ApiError, API_URL, request, toSearchParams } from './api-client';

// Re-exported so the twelve modules importing these from '@/lib/api' keep
// working; api-client.ts is where they are defined.
export { ApiError, API_URL, toSearchParams };

interface FetchOptions extends RequestInit {
  /** Seconds to cache the response for. 0 disables caching. */
  revalidate?: number;
}

/**
 * Storefront fetch. Used from server components only, so responses can be
 * cached by Next and no token is ever involved — every endpoint it touches is
 * public.
 */
/**
 * Storefront fetch. Server components only, so responses can be cached by Next
 * and no token is ever involved — every endpoint it touches is public.
 *
 * The only client that caches: 60s by default, which is why `revalidate` lives
 * on the options rather than being a shared concern.
 */
export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { revalidate = 60, ...init } = options;
  return request<T>(path, { ...init, revalidate });
}

// --- Storefront endpoints ---------------------------------------------------

interface SearchApiResult {
  data: { slug: string }[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

/**
 * A term with only the filters /search's SearchQueryDto actually supports
 * (single category/fabric/season, not FilterPanel's multi-select arrays) —
 * the common case of "just typed something into the search box". Multi-
 * select fabric/season, kind, or pieceCount alongside a term falls back to
 * catalog's own `contains` filter rather than silently dropping filters
 * /search cannot express; unifying that is a named follow-on (Phase 8
 * status note), not something to fake here.
 */
function canRouteThroughSearch(query: ProductListQuery): boolean {
  return Boolean(query.q?.trim()) && !query.kind && !query.pieceCount?.length && (query.fabric?.length ?? 0) <= 1 && (query.season?.length ?? 0) <= 1;
}

export async function getProducts(
  query: ProductListQuery,
): Promise<PaginatedResponse<StorefrontProduct>> {
  // WO-9.5 — a visual-search result is already a ranked, bounded list of
  // slugs (from /search/by-image); fetch each directly rather than routing
  // back through /search or /catalog/products, neither of which take a
  // slug list as input.
  if (query.visualSlugs?.length) {
    const products = (
      await Promise.all(query.visualSlugs.map((slug) => getProduct(slug, query.locale ?? 'en').catch(() => null)))
    ).filter((p): p is StorefrontProduct => p !== null);

    return {
      data: products,
      meta: { page: 1, pageSize: products.length, total: products.length, totalPages: 1, hasNext: false, hasPrevious: false },
    };
  }

  if (!canRouteThroughSearch(query)) {
    return apiFetch(`/catalog/products${toSearchParams(query as Record<string, unknown>)}`);
  }

  // WO-8.3 — a real search term routes through full-text search (ranking,
  // synonym expansion, trigram typo tolerance) instead of catalog's own
  // `contains` filter, which stays the fallback above for callers /search
  // cannot fully express. Facet count badges in FilterPanel are a named
  // follow-on (Phase 8 status note); this wires the ranking itself, the
  // exit criterion's substance.
  const searchResult = await apiFetch<SearchApiResult>(
    `/search${toSearchParams({
      q: query.q,
      locale: query.locale,
      category: query.category,
      fabric: query.fabric?.[0],
      season: query.season?.[0],
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      page: query.page,
      pageSize: query.pageSize,
    })}`,
  );

  const products = (
    await Promise.all(
      searchResult.data.map((hit) => getProduct(hit.slug, query.locale ?? 'en').catch(() => null)),
    )
  ).filter((p): p is StorefrontProduct => p !== null);

  return {
    data: products,
    meta: {
      ...searchResult.meta,
      hasNext: searchResult.meta.page < searchResult.meta.totalPages,
      hasPrevious: searchResult.meta.page > 1,
    },
  };
}

export function getProduct(slug: string, locale: string): Promise<StorefrontProduct> {
  return apiFetch(`/catalog/products/${encodeURIComponent(slug)}?locale=${locale}`);
}

interface RelatedProductsApiResult {
  slugs: string[];
  hasManualCuration: boolean;
}
interface SlugListApiResult {
  slugs: string[];
}

async function resolveProductsBySlug(slugs: string[], locale: string): Promise<StorefrontProduct[]> {
  return (
    await Promise.all(slugs.map((slug) => getProduct(slug, locale).catch(() => null)))
  ).filter((p): p is StorefrontProduct => p !== null);
}

/** WO-9.6 — manual cross-sell links first, then co-occurrence, then embedding similarity; hasManualCuration lets the caller label the section "Complete the look" rather than a generic "You may also like". */
export async function getRelatedProducts(
  slug: string,
  locale: string,
): Promise<{ products: StorefrontProduct[]; hasManualCuration: boolean }> {
  const result = await apiFetch<RelatedProductsApiResult>(
    `/catalog/products/${encodeURIComponent(slug)}/related`,
  );
  return { products: await resolveProductsBySlug(result.slugs, locale), hasManualCuration: result.hasManualCuration };
}

/** WO-9.6 — co-occurrence only ("customers who bought this also bought…"), for the bundle widget. */
export async function getFrequentlyBoughtTogether(slug: string, locale: string): Promise<StorefrontProduct[]> {
  const result = await apiFetch<SlugListApiResult>(
    `/catalog/products/${encodeURIComponent(slug)}/frequently-bought-together`,
  );
  return resolveProductsBySlug(result.slugs, locale);
}

export function getCategories(locale: string): Promise<CategoryNode[]> {
  return apiFetch(`/catalog/categories?locale=${locale}`);
}

export function getFacets(): Promise<CatalogFacets> {
  return apiFetch('/catalog/facets');
}

export function getStitchingServices(
  garmentType: string | undefined,
  locale: string,
): Promise<StorefrontProduct[]> {
  return apiFetch(
    `/catalog/stitching-services${toSearchParams({ garmentType, locale })}`,
  );
}

// --- Content (WO-8.1) -------------------------------------------------------

/** Active banners for one placement — see BANNER_PLACEMENTS in @newax/shared. */
export function getBanners(placement: string, locale: string): Promise<CmsBanner[]> {
  return apiFetch(`/content/banners${toSearchParams({ placement, locale })}`);
}

export function getPage(slug: string, locale: string): Promise<CmsPage> {
  return apiFetch(`/content/pages/${encodeURIComponent(slug)}${toSearchParams({ locale })}`);
}

export function getPosts(
  locale: string,
  page = 1,
  pageSize = 12,
): Promise<{ data: CmsPost[]; total: number }> {
  return apiFetch(`/content/posts${toSearchParams({ locale, page, pageSize })}`);
}

export function getPost(slug: string, locale: string): Promise<CmsPost> {
  return apiFetch(`/content/posts/${encodeURIComponent(slug)}${toSearchParams({ locale })}`);
}

/** A named footer menu slot — see MENU_KEYS in @newax/shared. */
export function getMenu(menuKey: string, locale: string): Promise<CmsMenuLink[]> {
  return apiFetch(`/content/menu/${encodeURIComponent(menuKey)}${toSearchParams({ locale })}`);
}
