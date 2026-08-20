'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import { CartBadge } from './cart-badge';
import { CustomerNav } from './customer-nav';
import { LocaleSwitcher } from './locale-switcher';
import { SearchBox } from './search-box';

import { MobileNav } from './mobile-nav';

const NAV = [
  { key: 'unstitched', href: '/shop?category=unstitched' },
  { key: 'readyToWear', href: '/shop?category=ready-to-wear' },
  { key: 'kidsWear', href: '/shop?category=kids-wear' },
  { key: 'stitching', href: '/shop?category=stitching-services&kind=STITCHING_SERVICE' },
  // Tailoring on the customer's own cloth — no fabric to buy, so it is a page of
  // its own rather than a catalogue filter.
  { key: 'ownFabric', href: '/stitching' },
] as const;

export function Header() {
  const t = useTranslations('nav');
  const tSite = useTranslations('site');
  const pathname = usePathname();

  const isActive = (href: string) => {
    const cleanPath = pathname.replace(/^\/(en|ur)/, '');
    const cleanHref = href.split('?')[0];
    return cleanPath === cleanHref || (cleanHref === '/shop' && cleanPath.startsWith('/shop'));
  };

  return (
    <header className="sticky top-0 z-40 border-b border-sand-300 bg-white shadow-sm">
      <div className="container-page">
        <div className="flex items-center justify-between py-4 md:py-5">
          <div className="flex items-center gap-6 md:gap-8" suppressHydrationWarning>
            <MobileNav items={NAV} />
            <Link href="/" className="shrink-0 text-xl font-semibold tracking-tight text-ink hover:text-brand-600 transition-colors duration-200">
              {tSite('name')}
            </Link>

            <nav aria-label="Main" className="hidden flex-1 md:flex">
              <div className="flex items-center gap-1">
                {NAV.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={`group relative px-3 py-2 text-sm font-medium transition-all duration-200 ease-out rounded-md ${
                        active
                          ? 'text-brand-600 bg-brand-50'
                          : 'text-ink/70 hover:text-ink hover:bg-sand-50 motion-safe:hover:-translate-y-0.5'
                      }`}
                    >
                      {t(item.key)}
                      <span className={`absolute bottom-0 start-0 h-0.5 transition-all duration-200 ${
                        active ? 'w-full bg-brand-600' : 'w-0 bg-brand-600 group-hover:w-full'
                      }`} />
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <SearchBox />
            <div className="h-6 w-px bg-sand-300 hidden sm:block" />
            <div className="rounded-md hover:bg-sand-50 transition-colors duration-200">
              <CustomerNav />
            </div>
            <div className="rounded-md hover:bg-sand-50 transition-colors duration-200">
              <CartBadge />
            </div>
            <div className="h-6 w-px bg-sand-300 hidden sm:block" />
            {/*
              The switcher reads the query string so filters survive a language
              change, which opts it out of prerendering without this boundary.
            */}
            <Suspense fallback={<div className="h-8 w-24" />}>
              <LocaleSwitcher />
            </Suspense>
          </div>
        </div>
      </div>
    </header>
  );
}
