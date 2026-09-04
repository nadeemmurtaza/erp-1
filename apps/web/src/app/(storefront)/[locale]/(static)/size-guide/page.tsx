import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { alternateLanguages, canonicalUrl } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'footer' });

  return {
    title: t('sizeGuide'),
    description: 'How to take accurate measurements for a custom-stitched fit — shoulders, chest, waist, hips, sleeves and length.',
    alternates: {
      canonical: canonicalUrl('/size-guide', locale),
      languages: alternateLanguages('/size-guide'),
    },
  };
}

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
      
      <p>For custom stitched items, accurate measurements are essential for a perfect fit. Please use a flexible measuring tape and ensure it is kept comfortably loose — never pull it too tight.</p>

      <h2>How to Measure</h2>
      <ul>
        <li><strong>Shoulders:</strong> Measure straight across the back from the edge of one shoulder to the other.</li>
        <li><strong>Chest/Bust:</strong> Measure around the fullest part of your chest, keeping the tape horizontal under your arms.</li>
        <li><strong>Waist:</strong> Measure around the narrowest part of your natural waistline.</li>
        <li><strong>Hips:</strong> Measure around the fullest part of your hips and buttocks.</li>
        <li><strong>Sleeves:</strong> Measure from the edge of your shoulder down your arm to your desired length (e.g., wrist or elbow).</li>
        <li><strong>Shirt Length:</strong> Measure from the top of your shoulder down to your desired hemline.</li>
        <li><strong>Trouser Length:</strong> Measure from your waist down to your ankle or desired hemline along the outside of your leg.</li>
      </ul>

      <p>If you have any specific requests or preferences (e.g., a looser fit around the waist), please mention them in the <strong>Tailor Notes</strong> section when checking out.</p>
    </>
  );
}
