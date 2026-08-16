import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import { CartBadge } from './cart-badge';
import { LocaleSwitcher } from './locale-switcher';
import { SearchBox } from './search-box';

const NAV = [
  { key: 'unstitched', href: '/shop?category=unstitched' },
  { key: 'readyToWear', href: '/shop?category=ready-to-wear' },
  { key: 'menswear', href: '/shop?category=menswear' },
  { key: 'stitching', href: '/shop?category=stitching-services&kind=STITCHING_SERVICE' },
] as const;

export function Header() {
  const t = useTranslations('nav');
  const tSite = useTranslations('site');

  return (
    <header className="sticky top-0 z-40 border-b border-sand-200 bg-sand-50/95 backdrop-blur">
      <div className="container-page">
        <div className="flex items-center gap-4 py-3">
          <Link href="/" className="shrink-0 text-xl font-semibold tracking-tight text-brand-700">
            {tSite('name')}
          </Link>

          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
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

          <div className="ms-auto flex items-center gap-3">
            <SearchBox />
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

        {/* On small screens the categories move below the logo row. */}
        <nav aria-label="Categories" className="flex gap-1 overflow-x-auto pb-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-ink/80 hover:bg-sand-100"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
