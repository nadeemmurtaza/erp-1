'use client';

import { cn } from '@/utils/cn';
import { Link, usePathname } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';

/**
 * The shopper's section nav.
 *
 * Wishlist was missing from this list. It has always been a real page with a
 * real route — the heart on a product card saves to it — but the only way to
 * reach it was to already know the URL, because nothing in the signed-in area
 * linked to it. That is the kind of gap that survives precisely because the
 * nav was inline in a layout rather than a thing with a name.
 */
const TABS = [
  { href: ROUTES.storefront.account, label: 'Profile', exact: true },
  { href: ROUTES.storefront.accountAddresses, label: 'Addresses' },
  { href: ROUTES.storefront.accountMeasurements, label: 'Measurements' },
  { href: ROUTES.storefront.orders, label: 'Orders' },
  { href: ROUTES.storefront.wishlist, label: 'Wishlist' },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account" className="mb-6 flex flex-wrap gap-1 border-b border-neutral-200">
      {TABS.map((tab) => {
        // `exact` for Profile only: every other tab owns a subtree, but
        // /account is the parent of all of them and would otherwise light up
        // on every page in the section.
        const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-accent text-accent-hover'
                : 'border-transparent text-neutral-900/60 hover:text-neutral-900',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
