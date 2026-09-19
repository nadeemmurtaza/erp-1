import type {
  CatalogFacets,
  CategoryNode,
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

export function getProducts(
  query: ProductListQuery,
): Promise<PaginatedResponse<StorefrontProduct>> {
  return apiFetch(`/catalog/products${toSearchParams(query as Record<string, unknown>)}`);
}

export function getProduct(slug: string, locale: string): Promise<StorefrontProduct> {
  return apiFetch(`/catalog/products/${encodeURIComponent(slug)}?locale=${locale}`);
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
