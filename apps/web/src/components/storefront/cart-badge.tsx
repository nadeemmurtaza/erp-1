'use client';

import { Link } from '@/i18n/navigation';
import { useCart } from './cart-provider';
import { ROUTES } from '@/constants/routes';

export function CartBadge() {
  const { cart, loading } = useCart();
  const count = cart?.itemCount ?? 0;

  return (
    <Link
      href={ROUTES.storefront.cart}
      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors duration-200 ease-out hover:bg-neutral-50 hover:text-neutral-900"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
      {/* Hidden while the first load is in flight so it does not flash 0. */}
      {!loading && count > 0 ? (
        <span className="inline-flex absolute -top-1 -end-1 min-w-[20px] h-5 items-center justify-center rounded-full bg-inverse text-xs font-bold text-on-inverse animate-scaleIn shadow-md">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
