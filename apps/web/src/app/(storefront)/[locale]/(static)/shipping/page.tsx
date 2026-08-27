import { getTranslations } from 'next-intl/server';

export default async function ShippingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'footer' });

  return (
    <>
      <h1>{t('shipping')}</h1>
      <p>Shipping and delivery information will be updated soon.</p>
    </>
  );
}
