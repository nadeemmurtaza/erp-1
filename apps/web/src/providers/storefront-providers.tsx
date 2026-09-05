'use client';

import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import type { ReactNode } from 'react';
import { CartProvider } from '@/components/storefront/cart-provider';
import { CustomerSessionProvider } from '@/components/storefront/customer-session';

/**
 * Every client-side context the storefront needs, in one wrapper.
 *
 * `locale` and `messages` are both passed explicitly and neither is
 * optional. NextIntlClientProvider picks them up from the request on its own
 * only when it is rendered by a Server Component; wrapping it in this client
 * component cuts it off from that context. Omitting `locale` throws
 * "Couldn't infer the `locale` prop", and omitting `messages` throws
 * "MISSING_MESSAGE: No messages were configured" from the first component
 * that calls useTranslations — the header, so every page.
 *
 * The layout used to nest these by hand, which meant the nesting order — and
 * the indentation — was re-decided at each edit; adding a fourth provider is
 * now one line here rather than another level of pyramid in a file that is
 * mostly `<html>` and metadata.
 *
 * Order matters and is deliberate: locale messages are outermost because a
 * provider below may render translated text, and the session sits above the
 * cart because a signed-in customer's cart is fetched against their identity.
 */
export function StorefrontProviders({
  children,
  locale,
  messages,
}: {
  children: ReactNode;
  locale: string;
  messages: AbstractIntlMessages;
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CustomerSessionProvider>
        <CartProvider>{children}</CartProvider>
      </CustomerSessionProvider>
    </NextIntlClientProvider>
  );
}
