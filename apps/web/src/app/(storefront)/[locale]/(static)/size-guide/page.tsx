import { getTranslations } from 'next-intl/server';

export default async function SizeGuidePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'footer' });

  return (
    <>
      <h1>{t('sizeGuide')}</h1>
      <p>Measurement guide will be updated soon.</p>
    </>
  );
}
