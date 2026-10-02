'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import { BottomNav } from './bottom-nav';
import { CartBadge } from './cart-badge';
import { CustomerNav } from './customer-nav';
import { LocaleSwitcher } from './locale-switcher';
import { Logo } from './logo';
import { SearchBox } from './search-box';
import { ThemeSwitch } from './theme-switch';

import { MobileNav } from './mobile-nav';
import { ROUTES } from '@/constants/routes';

type NavItem = {
  key: string;
  href?: string;
  submenu?: Array<{ key: string; href: string }>;
};

const NAV: NavItem[] = [
  { key: 'home', href: '/' },
  {
    key: 'women',
    submenu: [
      { key: 'womenStitched', href: '/shop?category=ready-to-wear' },
      { key: 'womenReadyToWear', href: '/shop?category=ready-to-wear' },
      { key: 'womenUnstitched', href: '/shop?category=unstitched' },
    ],
  },
  { key: 'kids', href: '/shop?category=kids-wear' },
  { key: 'collection', href: '/shop' },
  { key: 'bringYourFabric', href: '/stitching' },
] as const;

export function Header() {
  const t = useTranslations('nav');
  const tSite = useTranslations('site');
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isActive = (href: string) => {
    const cleanPath = pathname.replace(/^\/(en|ur)/, '') || '/';
    const cleanHref = href.split('?')[0];

    // If it's the home link, only match exactly the root path.
    if (cleanHref === '/') {
      return cleanPath === '/';
    }

    // If the link points to a shop page and we are on a shop page
    if (cleanPath.startsWith('/shop') && cleanHref.startsWith('/shop')) {
      const pathParams = new URLSearchParams(href.split('?')[1] || '');
      const hrefCategory = pathParams.get('category');
      const currentCategory = searchParams.get('category');

      if (hrefCategory) {
        // Link has a specific category (e.g., Kids, Women Stitched)
        return hrefCategory === currentCategory;
      } else {
        // Link is just "/shop" (Collection)
        // It is only strictly active if no category is explicitly selected
        return !currentCategory;
      }
    }

    // For all other links (e.g., /stitching), just do an exact match on the path
    return cleanPath === cleanHref;
  };

  return (
    <>
      <header className="sticky top-0 z-sticky border-b border-neutral-100 bg-white shadow-sm">
        <div className="container-page">
          <div className="flex items-center justify-between py-3 md:py-5">
            <div className="flex items-center gap-3 md:gap-8" suppressHydrationWarning>
              <MobileNav items={NAV} />
              <Link
                href="/"
                aria-label={tSite('name')}
                className="shrink-0 text-neutral-900 transition-colors duration-normal hover:text-neutral-600"
              >
                {/* The descender is the bottom third of the logo's box, so
                    centring the box leaves the word riding high — it measured
                    3.2px above the search field it sits beside. Half the
                    descender puts the word back on the row's centre line, and
                    as a percentage it stays right at both h-7 and h-8. */}
                <Logo aria-hidden className="block h-7 w-auto translate-y-[16%] md:h-8" />
              </Link>

              {/* lg:, not md:. At 768-1023px the logo, five nav labels, the search
                  field and the icon cluster do not fit on one line — the labels
                  wrapped to three lines and the row overflowed by ~190px. The
                  hamburger stays in charge until there is room. */}
              <nav aria-label="Main" className="hidden flex-1 lg:flex">
                <div className="flex items-center gap-1">
                  {NAV.map((item) => {
                    if (item.submenu) {
                      return (
                        <div key={item.key} className="group relative">
                          {(() => {
                            const isParentActive = item.submenu.some(sub => isActive(sub.href));
                            return (
                              <button
                                className={`relative whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-[background-color,color,transform] duration-normal ease-decelerate ${
                                  isParentActive
                                    ? 'bg-neutral-50 text-neutral-900'
                                    : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 motion-safe:hover:-translate-y-0.5'
                                }`}
                              >
                                {t(item.key)}
                                <span
                                  className={`absolute bottom-0 start-0 h-0.5 transition-[width] duration-normal ${
                                    isParentActive ? 'w-full bg-neutral-900' : 'w-0 bg-neutral-900 group-hover:w-full'
                                  }`}
                                />
                              </button>
                            );
                          })()}
                          <div className="invisible absolute start-0 top-full overflow-hidden rounded-md border border-neutral-100 bg-overlay opacity-0 shadow-md transition-[opacity,visibility] duration-normal group-hover:visible group-hover:opacity-100">
                            {item.submenu.map((subitem) => {
                              const subActive = isActive(subitem.href);
                              return (
                                <Link
                                  key={subitem.key}
                                  href={subitem.href}
                                  className={`block px-4 py-2 text-sm transition-colors duration-normal ${
                                    subActive
                                      ? 'bg-neutral-50 text-neutral-900'
                                      : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                                  }`}
                                >
                                  {t(subitem.key)}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    const active = item.href ? isActive(item.href) : false;
                    return (
                      <Link
                        key={item.key}
                        href={item.href || '/'}
                        className={`group relative whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-[background-color,color,transform] duration-normal ease-decelerate ${
                          active
                            ? 'bg-neutral-50 text-neutral-900'
                            : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 motion-safe:hover:-translate-y-0.5'
                        }`}
                      >
                        {t(item.key)}
                        <span className={`absolute bottom-0 start-0 h-0.5 transition-[width] duration-normal ${
                          active ? 'w-full bg-neutral-900' : 'w-0 bg-neutral-900 group-hover:w-full'
                        }`} />
                      </Link>
                    );
                  })}
                </div>
              </nav>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <SearchBox />
              {/*
                Below sm:, SearchBox above is hidden — this compact icon
                stands in for it in the shrunken mobile top bar, since the
                bottom pill already owns Home/Cart/Account there.
              */}
              <Link
                href={ROUTES.storefront.shop}
                aria-label={t('search')}
                className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors duration-normal hover:bg-neutral-50 hover:text-neutral-900 sm:hidden"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </Link>
              <div className="hidden h-6 w-px bg-neutral-200 lg:block" />
              {/* Cart and account move to the mobile bottom pill; the header keeps them for md: and up. */}
              <div className="hidden rounded transition-colors duration-normal hover:bg-neutral-50 lg:block">
                <CustomerNav />
              </div>
              {/* CartBadge sizes and colours its own hit target, so this wrapper only toggles visibility. */}
              <div className="hidden lg:block">
                <CartBadge />
              </div>
              <div className="hidden h-6 w-px bg-neutral-200 lg:block" />
              <ThemeSwitch />
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
      <BottomNav />
    </>
  );
}
