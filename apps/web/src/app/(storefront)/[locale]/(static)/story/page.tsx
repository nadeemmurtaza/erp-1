import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { alternateLanguages, canonicalUrl } from '@/config/seo';

/**
 * The shop's own story.
 *
 * The copy is translation rows, not JSX. It was four hardcoded English
 * paragraphs with the brand name typed into two of them, which meant an Urdu
 * reader got English and a rebrand needed someone to find this file. The
 * brand name is interpolated from `site.name`, which is already translated —
 * "Yaseen" in English, "یٰسین" in Urdu.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const [tFooter, tSite] = await Promise.all([
    getTranslations({ locale, namespace: 'footer' }),
    getTranslations({ locale, namespace: 'site' }),
  ]);

  return {
    title: tFooter('story'),
    description: tSite('tagline'),
    alternates: {
      canonical: canonicalUrl('/story', locale),
      languages: alternateLanguages('/story'),
    },
  };
}

export default async function StoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [tFooter, tStory, tSite] = await Promise.all([
    getTranslations({ locale, namespace: 'footer' }),
    getTranslations({ locale, namespace: 'story' }),
    getTranslations({ locale, namespace: 'site' }),
  ]);

  const brand = tSite('name');

  return (
    <>
      <h1>{tFooter('story')}</h1>

      <p>{tStory('welcome', { brand })}</p>
      <p>{tStory('intro')}</p>
      <p>{tStory('problem', { brand })}</p>
      <p>{tStory('how')}</p>
    </>
  );
}
