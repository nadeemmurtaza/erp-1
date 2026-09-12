'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { usePathname } from '@/i18n/navigation';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import { Loading } from '@/components/ui';

/**
 * The signed-in shopper's frame: a sign-in guard and the section nav.
 *
 * `(dashboard)` is a route group, so the parentheses keep it out of the URL —
 * /account and /orders are exactly where they were. What it buys is that the
 * customer's pages are one thing with one layout instead of three siblings
 * that happened to look alike. Orders and Wishlist sat outside the account
 * layout before and so had no nav at all; a customer who reached /orders
 * could not get back to their addresses without the browser's back button.
 *
 * Children never render for a signed-out visitor, so a page beneath this can
 * fetch its own data on mount without repeating the check.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useCustomerSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, user, router, pathname]);

  if (isLoading || !user) {
    return (
      <div className="container-page flex min-h-[50vh] items-center justify-center">
        <Loading />
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">My Account</h1>
      <p className="mb-6 text-sm text-neutral-900/60">{user.email ?? user.phone}</p>

      <DashboardNav />

      {children}
    </div>
  );
}
