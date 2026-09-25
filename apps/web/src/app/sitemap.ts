import type { MetadataRoute } from 'next';
import { LOCALES } from '@newax/shared';
import { apiFetch, getProducts } from '@/lib/api';
import { alternateLanguages } from '@/config/seo';

// Renders per-request rather than being prerendered at `next build` time —
// same reasoning as [locale]/layout.tsx's generateStaticParams comment: this
// route reads the catalogue from the API, so baking it into the build would
// make `next build` (and CI) depend on a running, seeded API. The product
// listing it calls is itself cached for 60s (apiFetch's default revalidate),
// so a crawler hitting /sitemap.xml repeatedly still isn't hammering the API.
export const dynamic = 'force-dynamic';

/** Public, indexable storefront paths that aren't backed by a dynamic list. */
const STATIC_PATHS = [
  '',
  '/shop',
  '/stitching',
  '/story',
  '/contact',
  '/shipping',
  '/size-guide',
  '/privacy',
  '/terms',
  '/returns',
  '/blog',
];

/** One entry per locale for a path, each carrying the full hreflang set. */
function entriesFor(
  path: string,
  extra: Partial<MetadataRoute.Sitemap[number]> = {},
): MetadataRoute.Sitemap {
  const languages = alternateLanguages(path);
  return LOCALES.map((locale) => ({
    url: languages[locale]!,
    alternates: { languages },
    ...extra,
  }));
}

/**
 * Every active product's slug, paged through at the API's max page size.
 * Slugs aren't translated per locale, so one listing call covers all of them.
 */
async function allProductSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  let page = 1;

  for (;;) {
    const result = await getProducts({ locale: 'en', page, pageSize: 100 });
    slugs.push(...result.data.map((product) => product.slug));
    if (!result.meta.hasNext) break;
    page += 1;
  }

  return slugs;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  for (const path of STATIC_PATHS) {
    entries.push(...entriesFor(path, { changeFrequency: 'weekly', priority: path === '' ? 1 : 0.6 }));
  }

  const slugs = await allProductSlugs();
  for (const slug of slugs) {
    entries.push(
      ...entriesFor(`/product/${slug}`, { changeFrequency: 'daily', priority: 0.8 }),
    );
  }

  // WO-8.1 — CMS pages and posts, indexable ones only (noindex/DRAFT excluded
  // server-side by ContentService.listIndexable{Page,Post}Slugs).
  const [pages, { data: posts }] = await Promise.all([
    apiFetch<{ slug: string }[]>('/content/pages'),
    apiFetch<{ data: { slug: string }[]; total: number }>('/content/posts?pageSize=200'),
  ]);
  for (const page of pages) {
    entries.push(...entriesFor(`/pages/${page.slug}`, { changeFrequency: 'monthly', priority: 0.5 }));
  }
  for (const post of posts) {
    entries.push(...entriesFor(`/blog/${post.slug}`, { changeFrequency: 'monthly', priority: 0.5 }));
  }

  return entries;
}
