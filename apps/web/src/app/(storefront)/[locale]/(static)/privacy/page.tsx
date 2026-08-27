import { getTranslations } from 'next-intl/server';

export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'footer' });

  return (
    <>
      <h1>{t('privacyPolicy')}</h1>
      <p>This privacy policy will be updated soon.</p>
    </>
  );
}
