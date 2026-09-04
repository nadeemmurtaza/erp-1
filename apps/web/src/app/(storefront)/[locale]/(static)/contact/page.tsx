import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { businessProfile } from '@/config/business-profile';
import { alternateLanguages, canonicalUrl } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'footer' });

  return {
    title: t('contact'),
    description: `Reach ${businessProfile.shortName} by email or WhatsApp — ${businessProfile.workingHours}.`,
    alternates: {
      canonical: canonicalUrl('/contact', locale),
      languages: alternateLanguages('/contact'),
    },
  };
}

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
        <li><strong>Email:</strong> {businessProfile.email}</li>
        <li><strong>WhatsApp / Phone:</strong> {businessProfile.whatsapp}</li>
      </ul>

      <h2>Operating Hours</h2>
      <p>{businessProfile.workingHours}</p>
      <p>We aim to respond to all queries within 24 hours.</p>
    </>
  );
}
