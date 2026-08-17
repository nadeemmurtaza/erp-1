import type {
  CatalogFacets,
  CategoryNode,
  PaginatedResponse,
  ProductListQuery,
  StorefrontProduct,
} from './api-types';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Turns a query object into a search string, dropping empties and flattening arrays. */
export function toSearchParams(query: Record<string, unknown>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }

  const search = params.toString();
  return search ? `?${search}` : '';
}

interface FetchOptions extends RequestInit {
  /** Seconds to cache the response for. 0 disables caching. */
  revalidate?: number;
}

/**
 * Storefront fetch. Used from server components only, so responses can be
 * cached by Next and no token is ever involved — every endpoint it touches is
 * public.
 */
export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { revalidate = 60, ...init } = options;

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
    next: revalidate > 0 ? { revalidate } : undefined,
    cache: revalidate > 0 ? undefined : 'no-store',
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => undefined);
    }

    const message =
      (body as { message?: string | string[] } | undefined)?.message ??
      `Request failed with ${response.status}`;

    throw new ApiError(
      response.status,
      Array.isArray(message) ? message.join(', ') : String(message),
      body,
    );
  }

  return (await response.json()) as T;
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
