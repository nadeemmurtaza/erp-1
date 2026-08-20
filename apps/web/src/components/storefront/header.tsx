import { useTranslations } from 'next-intl';
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
  { key: 'menswear', href: '/shop?category=menswear' },
  { key: 'stitching', href: '/shop?category=stitching-services&kind=STITCHING_SERVICE' },
  // Tailoring on the customer's own cloth — no fabric to buy, so it is a page of
  // its own rather than a catalogue filter.
  { key: 'ownFabric', href: '/stitching' },
] as const;

export function Header() {
  const t = useTranslations('nav');
  const tSite = useTranslations('site');

  return (
    <header className="sticky top-0 z-40 border-b border-sand-200 bg-white/95 backdrop-blur">
      <div className="container-page">
        <div className="flex items-center justify-between py-4 md:py-5">
          <div className="flex items-center gap-8">
            <MobileNav items={NAV} />
            <Link href="/" className="shrink-0 text-lg font-medium tracking-tight text-ink">
              {tSite('name')}
            </Link>

            <nav aria-label="Main" className="hidden flex-1 md:flex">
              <div className="flex items-center gap-6">
                {NAV.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="text-sm text-ink/70 transition-colors duration-200 hover:text-ink relative group"
                  >
                    {t(item.key)}
                    <span className="absolute bottom-0 start-0 h-0.5 w-0 bg-brand-600 transition-all duration-200 group-hover:w-full" />
                  </Link>
                ))}
              </div>
            </nav>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            <SearchBox />
            <div className="h-5 w-px bg-sand-200 hidden sm:block" />
            <CustomerNav />
            <CartBadge />
            <div className="h-5 w-px bg-sand-200 hidden sm:block" />
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
