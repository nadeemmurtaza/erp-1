'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useCart } from './cart-provider';

export function CartBadge() {
  const t = useTranslations('nav');
  const { cart, loading } = useCart();
  const count = cart?.itemCount ?? 0;

  return (
    <Link
      href="/cart"
      className="relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink/80 hover:bg-sand-100 hover:text-ink"
    >
      <span aria-hidden="true">🧺</span>
      <span className="hidden sm:inline">{t('cart')}</span>
      {/* Hidden while the first load is in flight so it does not flash 0. */}
      {!loading && count > 0 ? (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-medium text-white">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
