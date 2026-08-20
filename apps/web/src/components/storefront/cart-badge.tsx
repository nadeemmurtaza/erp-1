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
      className="relative inline-flex items-center gap-2 text-sm text-ink/70 transition-all duration-200 hover:text-ink group motion-safe:hover:animate-liftUp"
    >
      <span aria-hidden="true">🧺</span>
      <span className="hidden sm:inline group-hover:underline">{t('cart')}</span>
      {/* Hidden while the first load is in flight so it does not flash 0. */}
      {!loading && count > 0 ? (
        <span className="inline-flex absolute -top-3 -end-3 min-w-[20px] h-5 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white animate-scaleIn shadow-md">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
