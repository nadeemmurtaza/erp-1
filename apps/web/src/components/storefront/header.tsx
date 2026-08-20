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
    <header className="sticky top-0 z-40 border-b border-sand-200 bg-sand-50/95 backdrop-blur">
      <div className="container-page">
        <div className="flex items-center gap-2 md:gap-4 py-3">
          <MobileNav items={NAV} />
          <Link href="/" className="shrink-0 text-xl font-semibold tracking-tight text-brand-700">
            {tSite('name')}
          </Link>

          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex ms-4">
            {NAV.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-ink/80 hover:bg-sand-100 hover:text-ink"
              >
                {t(item.key)}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-1 sm:gap-3">
            <SearchBox />
            <CustomerNav />
            <CartBadge />
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
