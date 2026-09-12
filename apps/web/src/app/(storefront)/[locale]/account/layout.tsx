'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/utils/cn';
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
      <div className="container-page flex min-h-[50vh] items-center justify-center text-sm text-neutral-900/50">
        Loading…
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">My Account</h1>
      <p className="mb-6 text-sm text-neutral-900/60">{user.email ?? user.phone}</p>

      <nav className="mb-6 flex gap-1 border-b border-neutral-100">
        {TABS.map((tab) => {
          const isActive = tab.href === '/account' ? pathname === '/account' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-accent-hover text-accent-hover'
                  : 'border-transparent text-neutral-900/60 hover:text-neutral-900',
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
