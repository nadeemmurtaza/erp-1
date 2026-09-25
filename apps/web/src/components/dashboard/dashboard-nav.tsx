'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/cn';
import { Link, usePathname } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { request } from '@/lib/api-client';
import { isModuleEnabled } from '@/utils/module-gate';

/**
 * The shopper's section nav.
 *
 * Wishlist was missing from this list. It has always been a real page with a
 * real route — the heart on a product card saves to it — but the only way to
 * reach it was to already know the URL, because nothing in the signed-in area
 * linked to it. That is the kind of gap that survives precisely because the
 * nav was inline in a layout rather than a thing with a name.
 *
 * Labels are translation keys, not strings: this is a customer-facing surface
 * and half of it reads in Urdu.
 */
interface Tab {
  href: string;
  /** Key under `account.nav` in the message files. */
  key: string;
  /**
   * Matched exactly rather than by prefix. Profile only: /account is the
   * parent of every other tab's route and would otherwise light up on all of
   * them.
   */
  exact?: boolean;
  /** API module that owns this tab. Hidden when the module is off in MODULES — see @/utils/module-gate. */
  module?: string;
}

const TABS: Tab[] = [
  { href: ROUTES.storefront.accountOverview, key: 'overview' },
  { href: ROUTES.storefront.orders, key: 'orders' },
  { href: ROUTES.storefront.accountReturns, key: 'returns' },
  { href: ROUTES.storefront.accountMeasurements, key: 'measurements' },
  { href: ROUTES.storefront.accountAddresses, key: 'addresses' },
  { href: ROUTES.storefront.wishlist, key: 'wishlist' },
  { href: ROUTES.storefront.accountReviews, key: 'reviews' },
  { href: ROUTES.storefront.accountCredit, key: 'credit' },
  { href: ROUTES.storefront.accountLoyalty, key: 'loyalty' },
  // doc 155 — off by default (`wallet` module); see DECISIONS.md.
  { href: ROUTES.storefront.accountWallet, key: 'wallet', module: 'wallet' },
  { href: ROUTES.storefront.accountNotifications, key: 'notifications' },
  // Personal API keys (163-personal-api-keys.md) — the same place, under the
  // person's own account, as the admin's own "My API keys" (NAV-12).
  { href: ROUTES.storefront.accountApiKeys, key: 'apiKeys' },
  { href: ROUTES.storefront.account, key: 'profile', exact: true },
];

export function DashboardNav() {
  const pathname = usePathname();
  const t = useTranslations('account.nav');
  // `undefined` (not fetched yet) fails open, matching the admin shell's
  // own choice (utils/module-gate.ts) — a module-tagged tab shows until
  // /meta resolves, rather than the whole nav flickering empty on load.
  const [enabledModules, setEnabledModules] = useState<readonly string[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    request<{ modules: string[] }>('/meta')
      .then((meta) => {
        if (!cancelled) setEnabledModules(meta.modules);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const tabs = TABS.filter((tab) => isModuleEnabled(tab.module, enabledModules));

  return (
    <nav aria-label={t('label')} className="mb-6 flex flex-wrap gap-1 border-b border-neutral-100">
      {tabs.map((tab) => {
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
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
