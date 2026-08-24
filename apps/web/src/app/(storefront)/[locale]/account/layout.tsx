'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { Link, usePathname } from '@/i18n/navigation';
import { useCustomerSession } from '@/components/storefront/customer-session';

const TABS = [
  { href: '/account', label: 'Profile' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/measurements', label: 'Measurements' },
  { href: '/orders', label: 'Orders' },
];

/**
 * Shared frame for the account section: a sign-in guard (children never
 * render for a signed-out visitor) and the section's tab nav.
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
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
      <div className="container-page flex min-h-[50vh] items-center justify-center text-sm text-ink/50">
        Loading…
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <h1 className="mb-1 text-2xl font-semibold text-brand-700">My Account</h1>
      <p className="mb-6 text-sm text-ink/60">{user.email ?? user.phone}</p>

      <nav className="mb-6 flex gap-1 border-b border-sand-200">
        {TABS.map((tab) => {
          const isActive = tab.href === '/account' ? pathname === '/account' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-brand-700 text-brand-700'
                  : 'border-transparent text-ink/60 hover:text-ink',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
