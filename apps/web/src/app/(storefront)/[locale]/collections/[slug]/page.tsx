import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Locale } from '@newax/shared';
import { ProductCard } from '@/components/storefront/product-card';
import { apiFetch, ApiError, getProduct } from '@/lib/api';
import { alternateLanguages, canonicalUrl } from '@/config/seo';

export const revalidate = 120;

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

interface CollectionResult {
  collection: {
    id: string;
    slug: string;
    imageUrl: string | null;
    translation?: { name: string; description: string | null; metaTitle: string | null; metaDescription: string | null };
  };
  productSlugs: string[];
  total: number;
}

async function loadCollection(slug: string, locale: string, page: number) {
  try {
    return await apiFetch<CollectionResult>(`/collections/${encodeURIComponent(slug)}?locale=${locale}&page=${page}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const result = await loadCollection(slug, locale, 1);
  if (!result) return {};

  const path = `/collections/${slug}`;
  return {
    title: result.collection.translation?.metaTitle || result.collection.translation?.name,
    description: result.collection.translation?.metaDescription || result.collection.translation?.description || undefined,
    alternates: { canonical: canonicalUrl(path, locale), languages: alternateLanguages(path) },
  };
}

/** WO-8.2 — a curated or rule-based collection page. */
export default async function CollectionPage({ params, searchParams }: PageProps) {
  const { locale, slug } = await params;
  const { page: pageParam } = await searchParams;
  setRequestLocale(locale);

  const page = Number(pageParam) || 1;
  const result = await loadCollection(slug, locale, page);
  if (!result) notFound();

  const products = (
    await Promise.all(result.productSlugs.map((s) => getProduct(s, locale).catch(() => null)))
  ).filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <div className="container-page py-10 sm:py-14">
      <h1 className="font-display mb-2 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
        {result.collection.translation?.name}
      </h1>
      {result.collection.translation?.description ? (
        <p className="mb-8 max-w-2xl text-sm text-neutral-500">{result.collection.translation.description}</p>
      ) : (
        <div className="mb-8" />
      )}

      {products.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing in this collection yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} locale={locale as Locale} />
          ))}
        </div>
      )}
    </div>
  );
}
