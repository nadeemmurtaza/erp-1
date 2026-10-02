import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { BRAND } from '@newax/shared';
import '@/app/globals.css';
import { ThemeInitScript } from '@/components/ui/theme-init-script';

export const metadata: Metadata = {
  title: { default: BRAND.identity.adminName, template: `%s · ${BRAND.identity.adminName}` },
  // The back office must never be indexed.
  robots: { index: false, follow: false },
};

/**
 * The back office is English-only and sits outside the storefront's [locale]
 * routing, so it renders its own document. Only customer-facing text is
 * bilingual; staff tooling is one language by design.
 */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <ThemeInitScript />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
