'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { Locale } from '@yaseen/shared';
import { useRouter } from '@/i18n/navigation';
import type { StorefrontProduct } from '@/lib/api-types';
import { Price } from './price';
import { useCart } from './cart-provider';
import { StitchingPanel, type StitchingSelection } from './stitching-panel';

/**
 * One garment this fabric can become, with the fabric-need range derived from
 * its RTW size chart (XS vs XXL) — see fabricNeedRows in the product page.
 * Computed server-side since it needs the garment's full size chart, which
 * StorefrontProduct.garmentTypes doesn't carry.
 */
export interface FabricNeedRow {
  key: string;
  label: string;
  low: number;
  high: number;
  lowMetres: number;
  highMetres: number;
  /** False when there was no size-chart spread to derive a range from — low === high. */
  isRange: boolean;
}

interface ProductPurchaseProps {
  product: StorefrontProduct;
  locale: Locale;
  /** Stitching services that apply to this fabric's garments. */
  services: StorefrontProduct[];
  /** Empty unless stitching is available and at least one garment has a fabric benchmark. */
  fabricNeed: FabricNeedRow[];
}

/**
 * Variant selection, the stitching panel, and add to cart.
 *
 * The button posts the whole choice — variant, quantity, service, measurements
 * and style options — in one request, and the API prices it. Nothing about the
 * total is computed here and sent along.
 */
export function ProductPurchase({ product, locale, services, fabricNeed }: ProductPurchaseProps) {
  const t = useTranslations('product');
  const router = useRouter();
  const { add, error, clearError } = useCart();

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
  const [quantity, setQuantity] = useState(1);
  const [stitching, setStitching] = useState<StitchingSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  const selected =
    product.variants.find(
      (variant) =>
        (size === null || variant.size === size) &&
        (colour === null || variant.color === colour),
    ) ?? product.variants[0];

  const price = selected?.price ?? product.basePrice;

  // "Likely" garment = the first one offered, same default the stitching panel
  // itself starts from. No real measurements exist yet at this point in the
  // flow, so this is a soft nudge rather than the hard fabricShort warning the
  // panel shows once the customer's own numbers are in.
  const fabricMayRunShort =
    fabricNeed.length > 0 &&
    product.fabricMeters !== null &&
    product.fabricMeters < fabricNeed[0].lowMetres;

  // Stable identity so the panel's effect does not re-publish on every render.
  const onStitchingChange = useCallback((next: StitchingSelection | null) => {
    setStitching(next);
  }, []);

  async function onAdd() {
    if (!selected) return;

    setBusy(true);
    setAdded(false);
    clearError();

    try {
      await add({
        variantId: selected.id,
        quantity,
        stitching: stitching ?? undefined,
      });
      setAdded(true);
    } catch {
      // The message is surfaced from the cart context below.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Price amount={price} compareAt={product.compareAtPrice} locale={locale} size="lg" />
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
        <OptionRow label={t('selectSize')} options={sizes} value={size} onChange={setSize} />
      ) : null}

      {colours.length > 1 ? (
        <OptionRow
          label={t('selectColour')}
          options={colours}
          value={colour}
          onChange={setColour}
        />
      ) : null}

      {fabricNeed.length > 0 ? (
        <div className="rounded-md border border-sand-200 bg-white/60 p-3 text-sm">
          <p className="font-semibold text-brand-800">{t('fabricNeedEstimate')}</p>
          <ul className="mt-1.5 space-y-1">
            {fabricNeed.map((row) => (
              <li key={row.key} className="text-ink/70">
                <span className="font-medium text-ink">{row.label}</span>:{' '}
                {row.isRange
                  ? t('fabricNeedRange', {
                      low: row.low,
                      high: row.high,
                      lowM: row.lowMetres,
                      highM: row.highMetres,
                    })
                  : t('fabricNeedSingle', { gaz: row.low, metres: row.lowMetres })}
              </li>
            ))}
          </ul>
          {fabricMayRunShort ? (
            <p className="mt-1.5 text-xs text-ink/50">{t('fabricNeedCheckNote')}</p>
          ) : null}
        </div>
      ) : null}

      <StitchingPanel product={product} services={services} onChange={onStitchingChange} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="w-24">
          <span className="field-label">{t('quantity')}</span>
          <input
            type="number"
            min={1}
            max={Math.max(1, selected?.stock ?? 1)}
            value={quantity}
            onChange={(event) =>
              setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
            }
            className="field-input"
          />
        </label>

        <button
          type="button"
          onClick={() => void onAdd()}
          disabled={busy || !selected || selected.stock === 0}
          className="btn-primary flex-1 sm:flex-none"
        >
          {busy ? t('adding') : t('addToCart')}
        </button>
      </div>

      {error ? (
        <p role="alert" className="whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 animate-slideUp">
          {error}
        </p>
      ) : null}

      {added && !error ? (
        <p className="flex flex-wrap items-center gap-3 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800 animate-slideUp">
          {t('addedToCart')}
          <button
            type="button"
            onClick={() => router.push('/cart')}
            className="font-medium underline hover:text-brand-700 transition-colors"
          >
            {t('viewCart')}
          </button>
        </p>
      ) : null}

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
