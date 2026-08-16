'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { formatMoney, type Locale } from '@yaseen/shared';
import { Price } from './price';
import type { StorefrontProduct } from '@/lib/api-types';

interface ProductPurchaseProps {
  product: StorefrontProduct;
  locale: Locale;
  /** Cheapest stitching service for this fabric, in paisa. */
  stitchingFrom: number | null;
}

/**
 * Variant selection and the add-to-cart panel.
 *
 * The stitching section is shown here for unstitched fabric so the customer
 * sees what it costs before committing; the full "get it stitched" flow
 * (measurements and style options) lands with the cart in M3.
 */
export function ProductPurchase({ product, locale, stitchingFrom }: ProductPurchaseProps) {
  const t = useTranslations('product');
  const tCart = useTranslations('cart');

  const sizes = useMemo(
    () => unique(product.variants.map((variant) => variant.size)),
    [product.variants],
  );
  const colours = useMemo(
    () => unique(product.variants.map((variant) => variant.color)),
    [product.variants],
  );

  const [size, setSize] = useState<string | null>(sizes[0] ?? null);
  const [colour, setColour] = useState<string | null>(colours[0] ?? null);

  const selected =
    product.variants.find(
      (variant) =>
        (size === null || variant.size === size) &&
        (colour === null || variant.color === colour),
    ) ?? product.variants[0];

  const price = selected?.price ?? product.basePrice;

  return (
    <div className="space-y-6">
      <div>
        <Price
          amount={price}
          compareAt={product.compareAtPrice}
          locale={locale}
          size="lg"
        />
        <p className="mt-1 text-sm">
          {selected && selected.stock > 0 ? (
            selected.stock <= 3 ? (
              <span className="text-gold">{t('lowStock', { count: selected.stock })}</span>
            ) : (
              <span className="text-brand-700">{t('inStock')}</span>
            )
          ) : (
            <span className="text-ink/50">{t('outOfStock')}</span>
          )}
        </p>
      </div>

      {sizes.length > 1 ? (
        <OptionRow
          label={t('selectSize')}
          options={sizes}
          value={size}
          onChange={setSize}
        />
      ) : null}

      {colours.length > 1 ? (
        <OptionRow
          label={t('selectColour')}
          options={colours}
          value={colour}
          onChange={setColour}
        />
      ) : null}

      {product.stitchingAvailable ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
          <h2 className="text-sm font-semibold text-brand-800">{t('getItStitched')}</h2>
          <p className="mt-1 text-sm text-ink/70">{t('stitchingAvailable')}</p>

          {stitchingFrom !== null ? (
            <p className="mt-2 text-sm font-medium text-brand-800">
              {t('stitchingFrom', { price: formatMoney(stitchingFrom, locale) })}
            </p>
          ) : null}

          {product.garmentTypes.length > 0 ? (
            <p className="mt-3 text-xs text-ink/60">
              {t('canBeStitchedAs')}:{' '}
              {product.garmentTypes.map((garment) => garment.label).join('، ')}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <button
          type="button"
          disabled
          title={tCart('comingSoon')}
          className="btn-primary w-full sm:w-auto"
        >
          {t('addToCart')}
        </button>
        <p className="mt-2 text-xs text-ink/50">{tCart('comingSoon')}</p>
      </div>

      {selected ? (
        <p className="text-xs text-ink/40">
          {t('sku')}: {selected.sku}
        </p>
      ) : null}
    </div>
  );
}

function OptionRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (next: string) => void;
}) {
  return (
    <fieldset>
      <legend className="field-label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={clsx(
              'rounded-md border px-3 py-1.5 text-sm transition-colors',
              value === option
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-sand-300 bg-white text-ink hover:border-brand-400',
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
