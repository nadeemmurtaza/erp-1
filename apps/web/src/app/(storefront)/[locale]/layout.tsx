import type { Metadata } from 'next';
import { Encode_Sans } from 'next/font/google';
import { hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { directionFor, type Locale } from '@newax/shared';
import '@/app/globals.css';
import { AnalyticsBeacon } from '@/components/storefront/analytics-beacon';
import { Footer } from '@/components/storefront/footer';
import { Header } from '@/components/storefront/header';
import { JsonLd } from '@/components/storefront/json-ld';
import { OnsiteMessages } from '@/components/storefront/onsite-messages';
import { PageEnter } from '@/components/ui/page-enter';
import { SmoothScroller } from '@/components/storefront/smooth-scroller';
import { ThemeInitScript } from '@/components/ui/theme-init-script';
import { StorefrontProviders } from '@/providers/storefront-providers';
import { businessProfile } from '@/config/business-profile';
import { getMenu } from '@/lib/api';
import { routing } from '@/i18n/routing';
import { SITE_URL } from '@/config/site';
import { BRAND, intlTag } from '@newax/shared';

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
      locale: intlTag(locale as Locale).replace('-', '_'),
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
    // Rendered from that same icon.svg by scripts/build-logo-raster.mjs, so it
    // stays sharp wherever it is scaled; re-run that script if the icon changes.
    logo: `${SITE_URL}/logo-1024.png`,
    email: businessProfile.email,
    telephone: businessProfile.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: businessProfile.address,
      addressLocality: businessProfile.city,
      addressCountry: BRAND.locale.countryCode,
    },
    sameAs: Object.values(businessProfile.socials),
  };
}

/**
 * `Store` — a `LocalBusiness` subtype, the specific one that actually
 * describes a retail storefront rather than the generic organization
 * identity above. WO-3.8, 03-variants-sku-seo.md.
 */
function storeJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: businessProfile.name,
    url: SITE_URL,
    telephone: businessProfile.phone,
    email: businessProfile.email,
    priceRange: businessProfile.currency?.symbol ? `${businessProfile.currency.symbol}${businessProfile.currency.symbol}` : undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: businessProfile.address,
      addressLocality: businessProfile.city,
      addressCountry: BRAND.locale.countryCode,
    },
  };
}

/** `WebSite` + a `SearchAction` pointing at the shop's own search, so a search-savvy crawler can offer a sitelinks search box. */
function websiteJsonLd(locale: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: businessProfile.name,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/${locale}/shop?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
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

  // WO-8.1 — the two CMS-editable footer columns (content.prisma's MenuItem
  // doc comment explains why only these two, not the whole nav). Empty by
  // default (no rows yet), so a fresh store's footer renders exactly as it
  // did before this existed.
  const [footerHelpMenu, footerAboutMenu] = await Promise.all([
    getMenu('footer_help', locale).catch(() => []),
    getMenu('footer_about', locale).catch(() => []),
  ]);

  return (
    <html lang={locale} dir={directionFor(locale as Locale)} suppressHydrationWarning>
      <head>
        <ThemeInitScript />
      </head>
      <body
        className={`flex min-h-screen flex-col pb-24 md:pb-0 ${encodeSans.variable}`}
        suppressHydrationWarning
      >
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={storeJsonLd()} />
        <JsonLd data={websiteJsonLd(locale)} />
        <SmoothScroller>
          <StorefrontProviders locale={locale} messages={messages}>
            <AnalyticsBeacon />
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:z-toast focus:m-2 focus:rounded focus:bg-overlay focus:px-4 focus:py-2 focus:shadow"
            >
              {t('skipToContent')}
            </a>
            <OnsiteMessages locale={locale} />
            <Header />
            <main id="main" className="flex-1">
              <PageEnter>{children}</PageEnter>
            </main>
            <Footer footerHelpMenu={footerHelpMenu} footerAboutMenu={footerAboutMenu} />
          </StorefrontProviders>
        </SmoothScroller>
      </body>
    </html>
  );
}
