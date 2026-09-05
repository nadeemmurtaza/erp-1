import type { Metadata } from 'next';
import { Encode_Sans } from 'next/font/google';
import { hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { directionFor, type Locale } from '@yaseen/shared';
import '@/app/globals.css';
import { AnalyticsBeacon } from '@/components/storefront/analytics-beacon';
import { Footer } from '@/components/storefront/footer';
import { Header } from '@/components/storefront/header';
import { JsonLd } from '@/components/storefront/json-ld';
import { SmoothScroller } from '@/components/storefront/smooth-scroller';
import { StorefrontProviders } from '@/providers/storefront-providers';
import { businessProfile } from '@/config/business-profile';
import { routing } from '@/i18n/routing';
import { SITE_URL } from '@/config/site';

// Storefront reskin typeface. Variable font, so no `weight` list is needed —
// the full 100-900 range loads under one file. Exposed as --font-encode-sans
// (consumed by the `display` token in tailwind.config.ts) rather than applied
// as a className directly, so it composes with the existing `font-urdu`
// override on [lang='ur'] instead of fighting it.
const encodeSans = Encode_Sans({
  subsets: ['latin'],
  variable: '--font-encode-sans',
  display: 'swap',
});

/*
 * Deliberately no generateStaticParams.
 *
 * Catalogue pages read from the API, so prerendering them at build time would
 * make `next build` depend on a running, seeded API — CI could not build the
 * web app without standing up the backend, and a deploy would bake in whatever
 * the catalogue looked like at build time.
 *
 * Instead pages render on first request and are then cached for the `revalidate`
 * window each one declares. setRequestLocale calls stay in place so switching
 * back to static generation is a matter of adding this function again.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'site' });

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('tagline'),
    openGraph: {
      type: 'website',
      siteName: t('name'),
      locale: locale === 'ur' ? 'ur_PK' : 'en_PK',
    },
    twitter: { card: 'summary_large_image' },
  };
}

/** Sitewide Organization schema — one identity, referenced (not repeated) by every page's own JSON-LD. */
function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: businessProfile.name,
    alternateName: businessProfile.shortName,
    url: SITE_URL,
    // A raster export, not icon.svg — Google's structured-data guidelines
    // require the Organization logo to be jpg/png/gif, SVG isn't supported.
    logo: `${SITE_URL}/logo-512.png`,
    email: businessProfile.email,
    telephone: businessProfile.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: businessProfile.address,
      addressLocality: businessProfile.city,
      addressCountry: 'PK',
    },
    sameAs: Object.values(businessProfile.socials),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Lets the pages below render statically rather than opting into dynamic
  // rendering the moment they read a translation.
  setRequestLocale(locale);

  // Read on the server and handed to the client provider below, which
  // cannot fetch them itself — see StorefrontProviders.
  const messages = await getMessages();

  const t = await getTranslations({ locale, namespace: 'site' });

  return (
    <html lang={locale} dir={directionFor(locale as Locale)}>
      <body
        className={`flex min-h-screen flex-col ${encodeSans.variable}`}
        suppressHydrationWarning
      >
        <JsonLd data={organizationJsonLd()} />
        <SmoothScroller>
          <StorefrontProviders locale={locale} messages={messages}>
            <AnalyticsBeacon />
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:shadow"
            >
              {t('skipToContent')}
            </a>
            <Header />
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer />
          </StorefrontProviders>
        </SmoothScroller>
      </body>
    </html>
  );
}
