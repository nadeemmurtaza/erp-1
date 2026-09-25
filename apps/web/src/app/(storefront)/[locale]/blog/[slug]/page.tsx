import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ContentBlock, Locale } from '@newax/shared';
import { BlockRenderer } from '@/components/storefront/block-renderer';
import { JsonLd } from '@/components/storefront/json-ld';
import { ApiError, getPost } from '@/lib/api';
import { alternateLanguages, canonicalUrl } from '@/config/seo';
import { SITE_URL } from '@/config/site';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

async function loadPost(slug: string, locale: string) {
  try {
    return await getPost(slug, locale);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await loadPost(slug, locale);
  if (!post?.translation) return {};

  const path = `/blog/${slug}`;
  return {
    title: post.translation.metaTitle || post.translation.title,
    description: post.translation.metaDescription || post.translation.excerpt || undefined,
    alternates: { canonical: canonicalUrl(path, locale), languages: alternateLanguages(path) },
    openGraph: post.heroImageUrl ? { images: [{ url: post.heroImageUrl }] } : undefined,
  };
}

/** WO-8.1 — a published blog post, with Article JSON-LD for Rich Results. */
export default async function BlogPostPage({ params }: PageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const post = await loadPost(slug, locale);
  if (!post?.translation) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.translation.title,
    image: post.heroImageUrl ? [post.heroImageUrl] : undefined,
    datePublished: post.publishedAt ?? undefined,
    url: `${SITE_URL}/${locale}/blog/${slug}`,
  };

  return (
    <article className="container-page py-10 sm:py-14">
      <JsonLd data={jsonLd} />
      {post.heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- CMS-uploaded, unconstrained domain
        <img src={post.heroImageUrl} alt={post.translation.title} className="mb-8 aspect-video w-full rounded-md object-cover" />
      ) : null}
      <h1 className="font-display mb-8 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
        {post.translation.title}
      </h1>
      <BlockRenderer blocks={post.translation.body as ContentBlock[]} locale={locale as Locale} />
    </article>
  );
}
