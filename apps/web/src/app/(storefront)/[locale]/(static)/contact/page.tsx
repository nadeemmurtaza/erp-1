import { getTranslations } from 'next-intl/server';

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'footer' });

  return (
    <>
      <h1>{t('contact')}</h1>
      <p>Contact information will be updated soon.</p>
    </>
  );
}
