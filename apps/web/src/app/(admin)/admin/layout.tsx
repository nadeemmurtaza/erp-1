import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: { default: 'Yaseen Admin', template: '%s · Yaseen Admin' },
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
    <html lang="en" dir="ltr">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
