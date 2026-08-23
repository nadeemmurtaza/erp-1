'use client';

import { Link } from '@/i18n/navigation';
import { useCart } from './cart-provider';

export function CartBadge() {
  const { cart, loading } = useCart();
  const count = cart?.itemCount ?? 0;

  return (
    <Link
      href="/cart"
      className="group relative inline-flex items-center text-sm text-ink/70 transition-colors duration-200 ease-out hover:text-ink translate-y-0.5"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
      {/* Hidden while the first load is in flight so it does not flash 0. */}
      {!loading && count > 0 ? (
        <span className="inline-flex absolute -top-3 -end-3 min-w-[20px] h-5 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white animate-scaleIn shadow-md">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
