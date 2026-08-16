'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatMoney, type Locale } from '@yaseen/shared';
import { Link } from '@/i18n/navigation';
import { useCart } from '@/components/storefront/cart-provider';
import type { CartLine } from '@/lib/cart-types';

export default function CartPage() {
  const t = useTranslations('cart');
  const locale = useLocale() as Locale;
  const { cart, loading, error, update, remove } = useCart();

  if (loading) {
    return (
      <div className="container-page py-16 text-center text-sm text-ink/50">
        {t('loading')}
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
        <p className="mt-2 text-sm text-ink/60">{t('empty')}</p>
        <Link href="/shop" className="btn-primary mt-6 inline-flex">
          {t('startShopping')}
        </Link>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>

      {error ? (
        <p role="alert" className="mt-4 whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {cart.issues.length > 0 ? (
        <ul className="mt-4 space-y-1 rounded-md border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink/80">
          {cart.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <ul className="space-y-4">
          {cart.items.map((line) => (
            <CartRow
              key={line.id}
              line={line}
              locale={locale}
              onQuantity={(quantity) => void update(line.id, { quantity })}
              onRemove={() => void remove(line.id)}
            />
          ))}
        </ul>

        <aside className="card h-fit p-4 lg:sticky lg:top-24">
          <h2 className="text-sm font-semibold text-ink">{t('summary')}</h2>

          <dl className="mt-4 space-y-2 text-sm">
            <Row label={t('itemsSubtotal')} value={formatMoney(cart.totals.itemsSubtotal, locale)} />
            {cart.totals.stitchingSubtotal > 0 ? (
              <Row
                label={t('stitchingSubtotal')}
                value={formatMoney(cart.totals.stitchingSubtotal, locale)}
              />
            ) : null}
            <Row label={t('shipping')} value={t('shippingAtCheckout')} muted />
          </dl>

          <div className="mt-4 flex items-baseline justify-between border-t border-sand-200 pt-4">
            <span className="text-sm font-medium text-ink">{t('total')}</span>
            <span className="text-xl font-semibold text-ink">
              {formatMoney(cart.totals.grandTotal, locale)}
            </span>
          </div>

          <button type="button" disabled className="btn-primary mt-4 w-full">
            {t('checkout')}
          </button>
          <p className="mt-2 text-center text-xs text-ink/50">{t('checkoutComingSoon')}</p>

          <Link
            href="/shop"
            className="mt-4 block text-center text-sm text-brand-700 hover:underline"
          >
            {t('continueShopping')}
          </Link>
        </aside>
      </div>
    </div>
  );
}

function CartRow({
  line,
  locale,
  onQuantity,
  onRemove,
}: {
  line: CartLine;
  locale: Locale;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('cart');
  const [quantity, setQuantity] = useState(line.quantity);

  return (
    <li className="card flex gap-4 p-4">
      <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded bg-sand-100">
        {line.imageUrl ? (
          <Image src={line.imageUrl} alt={line.name} fill sizes="80px" className="object-cover" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/product/${line.slug}`}
              className="text-sm font-medium text-ink hover:text-brand-700"
            >
              {line.name}
            </Link>
            {line.variantLabel ? (
              <p className="text-xs text-ink/50">{line.variantLabel}</p>
            ) : null}
          </div>
          <span className="text-sm font-semibold text-ink">
            {formatMoney(line.lineTotal, locale)}
          </span>
        </div>

        {line.stitching ? (
          <div className="mt-2 rounded-md bg-brand-50 p-2.5 text-xs">
            <p className="font-medium text-brand-800">
              {line.stitching.serviceName} · {formatMoney(line.stitching.feePerUnit, locale)}
              {line.quantity > 1 ? ` × ${line.quantity}` : ''}
            </p>

            {line.stitching.options.length > 0 ? (
              <p className="mt-1 text-ink/70">
                {line.stitching.options
                  .map((option) => `${option.groupLabel}: ${option.label}`)
                  .join(' · ')}
              </p>
            ) : null}

            <p className="mt-1 text-ink/70">
              {line.stitching.measurementProfileLabel ? (
                <>
                  {t('measurements')}: {line.stitching.measurementProfileLabel}
                </>
              ) : (
                <span className="font-medium text-red-700">{t('measurementsMissing')}</span>
              )}
            </p>

            {line.stitching.notes ? (
              <p className="mt-1 italic text-ink/60">“{line.stitching.notes}”</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink/60">
            {t('quantity')}
            <input
              type="number"
              min={1}
              max={Math.max(1, line.availableStock)}
              value={quantity}
              onChange={(event) =>
                setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
              }
              onBlur={() => {
                if (quantity !== line.quantity) onQuantity(quantity);
              }}
              className="field-input w-16 py-1 text-sm"
            />
          </label>

          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-700 hover:underline"
          >
            {t('remove')}
          </button>

          {line.exceedsStock ? (
            <span className="text-xs font-medium text-red-700">
              {t('onlyLeft', { count: line.availableStock })}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink/60">{label}</dt>
      <dd className={muted ? 'text-ink/50' : 'text-ink'}>{value}</dd>
    </div>
  );
}
