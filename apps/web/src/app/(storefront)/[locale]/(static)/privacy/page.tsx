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
      
      <p>At Yaseen, we respect your privacy and are committed to protecting your personal data. This privacy policy explains how we collect, use, and safeguard your information when you visit our website.</p>

      <h2>Information We Collect</h2>
      <p>When you place an order, create an account, or contact us, we may collect:</p>
      <ul>
        <li>Your name, email address, phone number, and delivery address.</li>
        <li>Your custom body measurements (saved to your profile for future bespoke tailoring orders).</li>
        <li>Payment details (handled securely via our payment providers or verified via bank transfer receipts).</li>
      </ul>

      <h2>How We Use Your Information</h2>
      <p>We use this information exclusively to:</p>
      <ul>
        <li>Process and fulfill your orders, including custom tailoring instructions.</li>
        <li>Communicate with you regarding order updates, tracking, and delivery.</li>
        <li>Provide customer support.</li>
      </ul>

      <h2>Data Sharing</h2>
      <p>We do not sell your personal data. We only share necessary information (like your name, phone number, and address) with our trusted courier partners to ensure your order is delivered to you.</p>

      <h2>Security</h2>
      <p>We implement standard security measures to protect your personal information against unauthorized access or disclosure.</p>
    </>
  );
}
