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
      
      <p>Welcome to Yaseen. By using our website and placing an order, you agree to the following terms and conditions:</p>

      <h2>Order Processing and Cancellations</h2>
      <ul>
        <li><strong>Unstitched Fabrics:</strong> Orders for unstitched fabrics can be cancelled before they are dispatched. Once dispatched, our standard returns policy applies.</li>
        <li><strong>Custom Stitched Orders:</strong> Because stitched orders are made to your exact measurements, they <strong>cannot be cancelled once the fabric cutting process has begun</strong>.</li>
      </ul>

      <h2>Pricing and Availability</h2>
      <p>All prices are listed in Pakistani Rupees (PKR). While we strive for accuracy, errors in pricing or availability may occasionally occur. We reserve the right to cancel any order if an item is mispriced or out of stock, in which case a full refund will be provided.</p>

      <h2>Tailoring and Measurements</h2>
      <p>For bespoke tailoring, it is the customer's responsibility to provide accurate measurements. We will stitch the garment exactly to the measurements provided. We are not liable for fitting issues arising from incorrect measurements supplied by the customer.</p>

      <h2>Delivery</h2>
      <p>We make every effort to deliver your order within the estimated timeframes (3-5 days for unstitched, 10-14 days for stitched). However, delays caused by courier services or unforeseen circumstances are beyond our control.</p>
    </>
  );
}
