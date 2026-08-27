import { getTranslations } from 'next-intl/server';

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'footer' });

  return (
    <>
      <h1>{t('termsConditions')}</h1>
      <p>Terms and conditions will be updated soon.</p>
    </>
  );
}
