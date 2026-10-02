'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/cn';
import { Link } from '@/i18n/navigation';
import { useCart } from './cart-provider';
import { useCustomerSession } from './customer-session';
import { useWishlist } from '@/lib/wishlist';
import { ROUTES } from '@/constants/routes';

/**
 * Floating pill bottom-tab-bar, mobile-only (hidden at md: and above, where
 * the restyled top header carries navigation instead). This is the
 * reference's primary shortcut row — Home/Cart/Wishlist/Account — so the
 * mobile top bar no longer needs to duplicate those destinations.
 *
 * Icon order is fixed regardless of locale direction: a bottom tab bar's
 * layout is a device convention, not directional text, so the row is pinned
 * to `dir="ltr"` rather than left to inherit the page's RTL flow — a plain
 * `flex` row would otherwise visually reverse under Urdu because `dir="rtl"`
 * on the `<html>` ancestor flips what "row" means for the inline axis.
 */
export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { cart, loading: cartLoading } = useCart();
  const { count: wishlistCount } = useWishlist();
  const { user } = useCustomerSession();

  // Same locale-stripping approach as header.tsx's isActive(), reused here
  // rather than reimplemented so both nav shells agree on "the current page".
  const cleanPath = pathname.replace(/^\/(en|ur)/, '') || '/';
  const cartCount = cart?.itemCount ?? 0;
  // No profile page exists yet — mirrors CustomerNav's own choice of
  // destination (My Orders when signed in, the login form otherwise).
  const accountHref = user ? '/orders' : '/login';
  const accountActive =
    cleanPath === '/login' || cleanPath === '/register' || cleanPath.startsWith('/orders');

  return (
    <nav
      aria-label={t('bottomNav')}
      className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-sticky flex justify-center px-4 md:hidden"
    >
      {/*
        Pinned to the light palette: this is a dark pill floating over content
        in BOTH themes, and its `text-white` icons and white badge are written
        against the light ramp's values. Without the pin, `bg-neutral-700`
        would flip to a pale grey under white icons.
      */}
      <div
        dir="ltr"
        data-theme="light"
        className="inline-flex items-center gap-1 rounded bg-neutral-700 px-2 py-2 shadow-overlay"
      >
        <TabLink href="/" label={t('home')} active={cleanPath === '/'}>
          <HomeIcon />
        </TabLink>

        <TabLink
          href={ROUTES.storefront.cart}
          label={t('cart')}
          active={cleanPath === '/cart'}
          badge={!cartLoading && cartCount > 0 ? (cartCount > 99 ? '99+' : cartCount) : null}
        >
          <BagIcon />
        </TabLink>

        <TabLink
          href={ROUTES.storefront.wishlist}
          label={t('wishlist')}
          active={cleanPath === '/wishlist'}
          badge={wishlistCount > 0 ? (wishlistCount > 99 ? '99+' : wishlistCount) : null}
        >
          <HeartIcon />
        </TabLink>

        <TabLink href={accountHref} label={t('account')} active={accountActive}>
          <UserIcon />
        </TabLink>
      </div>
    </nav>
  );
}

function TabLink({
  href,
  label,
  active,
  badge,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  badge?: string | number | null;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-normal',
        active ? 'text-white' : 'text-white/55 hover:text-white/85'
      )}
    >
      {children}
      {badge ? (
        <span className="absolute -top-1 end-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold leading-none text-neutral-900 shadow-sm">
          {badge}
        </span>
      ) : null}
      {active ? <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-white" aria-hidden="true" /> : null}
    </Link>
  );
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
