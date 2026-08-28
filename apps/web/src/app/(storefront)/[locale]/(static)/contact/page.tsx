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
      
      <p>We are always here to help! Whether you have a question about our fabrics, need assistance with your measurements, or want an update on your stitching order, feel free to reach out to us.</p>
      
      <h2>Customer Support</h2>
      <ul>
        <li><strong>Email:</strong> support@yaseen.pk</li>
        <li><strong>WhatsApp / Phone:</strong> +92 300 1234567 <em>(Please replace this with your actual number)</em></li>
      </ul>

      <h2>Operating Hours</h2>
      <p>Monday to Saturday: 10:00 AM – 6:00 PM (PKT)</p>
      <p>We aim to respond to all queries within 24 hours.</p>
    </>
  );
}
