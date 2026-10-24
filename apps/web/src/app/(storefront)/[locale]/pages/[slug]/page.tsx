import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ContentBlock, Locale } from '@newax/shared';
import { BlockRenderer } from '@/components/storefront/block-renderer';
import { ApiError, getPage } from '@/lib/api';
import { alternateLanguages, canonicalUrl } from '@/config/seo';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

async function loadPage(slug: string, locale: string) {
  try {
    return await getPage(slug, locale);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await loadPage(slug, locale);
  if (!page?.translation) return {};

  const path = `/pages/${slug}`;
  return {
    title: page.translation.metaTitle || page.translation.title,
    description: page.translation.metaDescription || undefined,
    alternates: { canonical: canonicalUrl(path, locale), languages: alternateLanguages(path) },
  };
}

/** WO-8.1 — a CMS-published landing page, no deploy required. */
export default async function CmsPage({ params }: PageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const page = await loadPage(slug, locale);
  if (!page?.translation) notFound();

  return (
    <div className="container-page py-10 sm:py-14">
      <h1 className="font-display mb-8 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
        {page.translation.title}
      </h1>
      <BlockRenderer blocks={page.translation.body as ContentBlock[]} locale={locale as Locale} />
    </div>
  );
}
