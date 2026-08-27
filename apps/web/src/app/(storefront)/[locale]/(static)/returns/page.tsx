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
      
      <h2>Unstitched Fabrics</h2>
      <p>Unstitched items can be returned or exchanged within <strong>7 days</strong> of delivery, provided they are:</p>
      <ul>
        <li>Unused and unwashed</li>
        <li>Uncut and not altered in any way</li>
        <li>Returned in their original packaging with all tags attached</li>
      </ul>

      <h2>Custom Stitched Items</h2>
      <p>Because bespoke stitched items are tailored specifically to your unique measurements, they are <strong>strictly non-refundable and cannot be exchanged</strong>.</p>
      <p>Exceptions are only made in the highly unlikely event of a clear manufacturing defect or a tailoring error on our end. If you receive a defective item, please contact us within 48 hours of delivery.</p>

      <h2>How to Initiate a Return</h2>
      <p>To start a return, please contact our support team via email or WhatsApp with your order number and photographs of the product.</p>
    </>
  );
}
