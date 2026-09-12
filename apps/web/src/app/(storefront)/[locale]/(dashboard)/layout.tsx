'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import { Loading } from '@/components/ui';

/**
 * The shopper's frame: the page container, the section nav, and the sign-in
 * guard.
 *
 * `(dashboard)` is a route group, so the parentheses keep it out of the URL —
 * /account and /orders are exactly where they were. What it buys is that the
 * customer's pages are one thing with one layout instead of three siblings
 * that happened to look alike. Orders and Wishlist sat outside the account
 * layout before and so had no nav at all.
 *
 * This layout owns the container and nothing else visible. It used to print
 * "My Account" as an `h1` on every page beneath it, which meant /orders and
 * /wishlist rendered a second `h1` of their own and /account/addresses
 * rendered none — every page here either had two competing titles or was
 * titled after the section rather than itself. The title belongs to the page;
 * this owns the frame.
 */

/**
 * Children a signed-out visitor may see.
 *
 * The order confirmation is the whole list, and it has to be: checkout sends
 * *every* buyer to /orders/{number}, guests included, and the page knows how
 * to ask a guest for the phone number the order was placed with. Guarding it
 * bounced them to /login the moment they paid and left that tracking form
 * unreachable. Match the route, not a prefix — /orders itself is the signed-in
 * history and stays guarded.
 */
const PUBLIC_ROUTES = [/^\/orders\/[^/]+$/];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useCustomerSession();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('account');

  const guestsWelcome = PUBLIC_ROUTES.some((route) => route.test(pathname));

  useEffect(() => {
    if (!isLoading && !user && !guestsWelcome) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, user, guestsWelcome, router, pathname]);

  // Still resolving the session, or the redirect above is in flight.
  if (isLoading || (!user && !guestsWelcome)) {
    return (
      <div className="container-page flex min-h-[50vh] items-center justify-center">
        <Loading />
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      {user ? (
        <>
          <p className="mb-4 text-sm text-neutral-900/50">
            {t('signedInAs', { who: user.email ?? user.phone ?? '' })}
          </p>
          <DashboardNav />
        </>
      ) : null}

      {children}
    </div>
  );
}
