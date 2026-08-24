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
      <div className="container-page pb-28 pt-16 text-center font-display text-sm text-noir-400 md:pb-16">
        {t('loading')}
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-page pb-28 pt-16 text-center font-display md:pb-16">
        <h1 className="text-2xl font-semibold tracking-tight text-noir-900">{t('title')}</h1>
        <p className="mt-2 text-sm text-noir-500">{t('empty')}</p>
        <Link href="/shop" className="mt-6 sf-btn-primary">
          {t('startShopping')}
        </Link>
      </div>
    );
  }

  return (
    <div className="container-page pb-28 pt-6 font-display sm:pt-8 md:pb-12">
      <h1 className="text-2xl font-semibold tracking-tight text-noir-900 sm:text-3xl">{t('title')}</h1>

      {error ? (
        <p
          role="alert"
          className="mt-4 whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      {cart.issues.length > 0 ? (
        <ul className="mt-4 space-y-1 rounded-2xl border border-noir-200 bg-noir-50 px-4 py-3 text-sm text-noir-800">
          {cart.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 grid gap-6 sm:mt-8 lg:grid-cols-[1fr_22rem] lg:gap-8">
        <ul className="space-y-3 sm:space-y-4">
          {cart.items.map((line) => (
            <CartRow
              key={line.id}
              line={line}
              locale={locale}
              onQuantity={(quantity) => update(line.id, { quantity })}
              onRemove={() => remove(line.id)}
            />
          ))}
        </ul>

        <aside className="sf-card h-fit p-4 sm:p-6 lg:sticky lg:top-24">
          <h2 className="text-base font-semibold text-noir-900">{t('summary')}</h2>

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

          <div className="mt-4 flex items-baseline justify-between border-t border-noir-200 pt-4">
            <span className="text-sm font-medium text-noir-900">{t('total')}</span>
            <span className="text-xl font-semibold text-noir-900">
              {formatMoney(cart.totals.grandTotal, locale)}
            </span>
          </div>

          <Link
            href="/checkout"
            aria-disabled={cart.issues.length > 0}
            className={
              cart.issues.length > 0
                ? 'sf-btn-primary pointer-events-none mt-4 block w-full py-3.5 opacity-50 sm:text-base'
                : 'sf-btn-primary mt-4 block w-full py-3.5 sm:text-base'
            }
          >
            {t('checkout')}
          </Link>

          <Link
            href="/shop"
            className="mt-4 block text-center text-sm text-noir-600 transition-colors duration-200 hover:text-noir-900 hover:underline"
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
  onQuantity: (quantity: number) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const t = useTranslations('cart');
  // A single row-scoped guard covers both the stepper and the remove button:
  // it stops a second tap firing while the first mutation is still in flight
  // (the previous input+onBlur flow only ever sent one request per edit, so
  // clicks needed the same protection once they fire on every tap).
  const [busy, setBusy] = useState(false);
  const maxQuantity = Math.max(1, line.availableStock);

  async function guarded(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="sf-card flex gap-3 p-3 sm:gap-4 sm:p-4">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-noir-50 sm:h-24 sm:w-24">
        {line.imageUrl ? (
          <Image src={line.imageUrl} alt={line.name} fill sizes="96px" className="object-cover" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/product/${line.slug}`}
              className="text-sm font-medium text-noir-900 transition-colors duration-200 hover:text-noir-600"
            >
              {line.name}
            </Link>
            {line.variantLabel ? <p className="mt-0.5 text-xs text-noir-500">{line.variantLabel}</p> : null}
          </div>

          <button
            type="button"
            onClick={() => void guarded(onRemove)}
            disabled={busy}
            aria-label={t('remove')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-noir-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-noir-400"
          >
            <TrashIcon />
          </button>
        </div>

        {/*
          Stitching/measurement detail this store's cart carries that the
          reference's simple line item has no equivalent of — kept fully
          intact as a muted sub-block under the name, just restyled to the
          monochrome surface.
        */}
        {line.stitching ? (
          <div className="mt-2 rounded-xl bg-noir-50 p-2.5 text-xs text-noir-600">
            <p className="font-medium text-noir-800">
              {line.stitching.serviceName} · {formatMoney(line.stitching.feePerUnit, locale)}
              {line.quantity > 1 ? ` × ${line.quantity}` : ''}
            </p>

            {line.stitching.options.length > 0 ? (
              <p className="mt-1">
                {line.stitching.options
                  .map((option) => `${option.groupLabel}: ${option.label}`)
                  .join(' · ')}
              </p>
            ) : null}

            <p className="mt-1">
              {line.stitching.measurementProfileLabel ? (
                <>
                  {t('measurements')}: {line.stitching.measurementProfileLabel}
                </>
              ) : (
                <span className="font-medium text-red-600">{t('measurementsMissing')}</span>
              )}
            </p>

            {line.stitching.notes ? (
              <p className="mt-1 italic text-noir-500">&ldquo;{line.stitching.notes}&rdquo;</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <QuantityStepper
            quantity={line.quantity}
            max={maxQuantity}
            busy={busy}
            onChange={(quantity) => void guarded(() => onQuantity(quantity))}
            decreaseLabel={t('decreaseQuantity')}
            increaseLabel={t('increaseQuantity')}
          />
          <span className="text-sm font-semibold text-noir-900">
            {formatMoney(line.lineTotal, locale)}
          </span>
        </div>

        {line.exceedsStock ? (
          <p className="mt-2 text-xs font-medium text-red-600">
            {t('onlyLeft', { count: line.availableStock })}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function QuantityStepper({
  quantity,
  max,
  busy,
  onChange,
  decreaseLabel,
  increaseLabel,
}: {
  quantity: number;
  max: number;
  busy: boolean;
  onChange: (quantity: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  // A plain flex row rather than a fixed `dir="ltr"` shell (compare
  // bottom-nav.tsx's tab bar): minus/plus flanking a count is not a device
  // convention like a tab bar's icon order, so it should reverse under
  // `dir="rtl"` the way any other flex row does.
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-noir-200 p-1">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={busy || quantity <= 1}
        aria-label={decreaseLabel}
        className="flex h-7 w-7 items-center justify-center rounded-full text-noir-700 transition-colors duration-200 hover:bg-noir-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <MinusIcon />
      </button>
      <span className="min-w-[1.5rem] text-center text-sm font-medium text-noir-900">{quantity}</span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={busy || quantity >= max}
        aria-label={increaseLabel}
        className="flex h-7 w-7 items-center justify-center rounded-full text-noir-700 transition-colors duration-200 hover:bg-noir-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <PlusIcon />
      </button>
    </div>
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
      <dt className="text-noir-500">{label}</dt>
      <dd className={muted ? 'text-noir-400' : 'text-noir-900'}>{value}</dd>
    </div>
  );
}

function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
