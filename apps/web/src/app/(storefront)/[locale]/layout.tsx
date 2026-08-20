import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { directionFor, type Locale } from '@yaseen/shared';
import '@/app/globals.css';
import { CartProvider } from '@/components/storefront/cart-provider';
import { CustomerSessionProvider } from '@/components/storefront/customer-session';
import { Footer } from '@/components/storefront/footer';
import { Header } from '@/components/storefront/header';
import { routing } from '@/i18n/routing';

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
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('tagline'),
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

  const t = await getTranslations({ locale, namespace: 'site' });

  return (
    <html lang={locale} dir={directionFor(locale as Locale)}>
      <body className="flex min-h-screen flex-col" suppressHydrationWarning>
        <NextIntlClientProvider>
          <CustomerSessionProvider>
            <CartProvider>
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
            </CartProvider>
          </CustomerSessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
