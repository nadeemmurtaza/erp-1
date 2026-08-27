import { getTranslations } from 'next-intl/server';

export default async function StoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'footer' });

  return (
    <>
      <h1>{t('story')}</h1>
      <p>Our story will be updated soon.</p>
    </>
  );
}
