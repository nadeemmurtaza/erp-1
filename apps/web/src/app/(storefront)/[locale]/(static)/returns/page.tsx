import { getTranslations } from 'next-intl/server';

export default async function ReturnsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'footer' });

  return (
    <>
      <h1>{t('returns')}</h1>
      <p>Returns policy will be updated soon.</p>
    </>
  );
}
