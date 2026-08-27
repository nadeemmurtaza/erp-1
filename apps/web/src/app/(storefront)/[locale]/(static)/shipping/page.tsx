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
      
      <h2>Delivery Times</h2>
      <ul>
        <li><strong>Unstitched Fabrics:</strong> Standard delivery across Pakistan takes 3-5 working days.</li>
        <li><strong>Custom Stitched Orders:</strong> Because your garments are tailored specifically to your measurements, please allow 10-14 working days for delivery.</li>
      </ul>

      <h2>Shipping Charges</h2>
      <p>Delivery charges are automatically calculated at checkout based on your city and the weight of your order.</p>

      <h2>Payment Methods</h2>
      <p>We accept <strong>Cash on Delivery (COD)</strong> and direct <strong>Bank Transfers</strong>. For stitched orders, we may require an upfront deposit via bank transfer before the cutting process begins.</p>
    </>
  );
}
