import { getTranslations } from 'next-intl/server';

export default async function StoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'footer' });

  return (
    <>
      <h1>{t('story')}</h1>
      
      <p>Welcome to <strong>Yaseen</strong>.</p>
      
      <p>We are a premium clothing brand dedicated to blending high-quality fabrics with seamless, personalized custom tailoring.</p>
      
      <p>Finding a reliable tailor can often be a frustrating experience filled with delays, sizing errors, and multiple trips to the shop. We started Yaseen to take the hassle entirely out of the equation. We source the finest unstitched fabrics and offer a bespoke, in-house tailoring service right on our website.</p>
      
      <p>Simply choose your favorite fabric, input your exact measurements online, and let our master tailors craft a beautiful, ready-to-wear outfit perfectly fitted to you, delivered straight to your doorstep.</p>
    </>
  );
}
