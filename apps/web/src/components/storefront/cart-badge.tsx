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
      className="relative inline-flex items-center gap-2 text-sm text-ink/70 transition-colors duration-200 hover:text-ink group"
    >
      <span aria-hidden="true">🧺</span>
      <span className="hidden sm:inline group-hover:underline">{t('cart')}</span>
      {/* Hidden while the first load is in flight so it does not flash 0. */}
      {!loading && count > 0 ? (
        <span className="inline-flex absolute -top-2 -end-2 h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white animate-scaleIn">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
