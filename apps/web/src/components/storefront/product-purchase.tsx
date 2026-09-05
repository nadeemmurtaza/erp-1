'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/utils/cn';
import { formatMoney, type Locale } from '@yaseen/shared';
import { useRouter } from '@/i18n/navigation';
import type { StorefrontProduct } from '@/types/api';
import { Price } from './price';
import { useCart } from './cart-provider';
import { StitchingPanel, type StitchingSelection } from './stitching-panel';
import { SizeChartModal } from './size-chart-modal';
import type { StitchingGarment } from '@/types/cart';

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
  /** Garments available for this product with size charts. */
  stitchingGarments: StitchingGarment[];
}

/**
 * Variant selection, the stitching panel, and add to cart.
 *
 * The button posts the whole choice — variant, quantity, service, measurements
 * and style options — in one request, and the API prices it. Nothing about the
 * total is computed here and sent along.
 *
 * The primary action renders twice: a normal inline button for md: and up,
 * and a sticky full-width pill for mobile, matching the reference's
 * mobile-only sticky-CTA convention. Both share the same handler and disabled
 * state — only one is ever visible/interactive at a given width.
 */
export function ProductPurchase({ product, locale, services, fabricNeed, stitchingGarments }: ProductPurchaseProps) {
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
  // First hex seen for each colour name, for the swatch row — a colour with
  // no hex on any of its variants falls back to a plain neutral swatch
  // rather than guessing a value that isn't in the data.
  const colourSwatches = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const variant of product.variants) {
      if (variant.color && !map.has(variant.color)) {
        map.set(variant.color, variant.colorHex);
      }
    }
    return map;
  }, [product.variants]);

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
  const showCompare = typeof product.compareAtPrice === 'number' && product.compareAtPrice > price;
  const maxQuantity = Math.max(1, selected?.stock ?? 1);

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

  const addDisabled = busy || !selected || selected.stock === 0;

  return (
    <div className="space-y-6">
      <div>
        <Price amount={price} compareAt={product.compareAtPrice} locale={locale} size="lg" />
        <p className="mt-1 text-sm">
          {selected && selected.stock > 0 ? (
            selected.stock <= 3 ? (
              <span className="font-semibold text-neutral-900">
                {t('lowStock', { count: selected.stock })}
              </span>
            ) : (
              <span className="text-neutral-500">{t('inStock')}</span>
            )
          ) : (
            <span className="text-neutral-400">{t('outOfStock')}</span>
          )}
        </p>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-neutral-900">{t('quantity')}</span>
        <div className="inline-flex items-center gap-4">
          <button
            type="button"
            onClick={() => setQuantity((current) => Math.max(1, current - 1))}
            disabled={quantity <= 1}
            aria-label={t('decreaseQuantity')}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 text-neutral-900 transition-colors duration-200 hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MinusIcon />
          </button>
          <span className="w-6 text-center text-base font-semibold text-neutral-900" aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))}
            disabled={quantity >= maxQuantity}
            aria-label={t('increaseQuantity')}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 text-neutral-900 transition-colors duration-200 hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      {sizes.length > 1 ? (
        <SizeRow
          label={t('selectSize')}
          options={sizes}
          value={size}
          onChange={setSize}
          // Sits on the Size row itself rather than up beside the price: a
          // shopper wants the chart at the moment they are choosing between
          // S/M/L, not before they have got there. Renders nothing when the
          // product has no garment carrying a size chart.
          action={
            <SizeChartModal
              productName={product.name}
              garments={stitchingGarments}
              locale={locale}
            />
          }
        />
      ) : null}

      {colours.length > 1 ? (
        <ColourRow
          label={t('selectColour')}
          options={colours}
          swatches={colourSwatches}
          value={colour}
          onChange={setColour}
        />
      ) : null}

      {fabricNeed.length > 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-3 text-sm">
          <p className="font-semibold text-neutral-900">{t('fabricNeedEstimate')}</p>
          <ul className="mt-1.5 space-y-1">
            {fabricNeed.map((row) => (
              <li key={row.key} className="text-neutral-600">
                <span className="font-medium text-neutral-900">{row.label}</span>:{' '}
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
            <p className="mt-1.5 text-xs text-neutral-500">{t('fabricNeedCheckNote')}</p>
          ) : null}
        </div>
      ) : null}

      <StitchingPanel product={product} services={services} onChange={onStitchingChange} />

      {/* Inline primary action, md: and up — mobile gets the sticky bar below instead. */}
      <button
        type="button"
        onClick={() => void onAdd()}
        disabled={addDisabled}
        className="sf-btn-primary hidden md:inline-flex"
      >
        {busy ? t('adding') : t('addToCart')}
      </button>

      {error ? (
        <p role="alert" className="whitespace-pre-line rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700 animate-slideUp">
          {error}
        </p>
      ) : null}

      {added && !error ? (
        <p className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 animate-slideUp">
          {t('addedToCart')}
          <button
            type="button"
            onClick={() => router.push('/cart')}
            className="font-medium underline transition-colors hover:text-neutral-600"
          >
            {t('viewCart')}
          </button>
        </p>
      ) : null}

      {selected ? (
        <p className="text-xs text-neutral-400">
          {t('sku')}: {selected.sku}
        </p>
      ) : null}

      {/*
        Sticky mobile CTA, floating above the fixed bottom-nav pill rather
        than flush to the screen edge — bottom-nav.tsx's pill sits at
        max(1rem, safe-area) tall by 4rem (h-12 tabs + py-2), so this clears
        that footprint plus a small gap rather than stacking on top of it.
        The page root (product/[slug]/page.tsx) reserves bottom space for
        both so scrolled-to-bottom content is never hidden behind either.
      */}
      <div className="fixed inset-x-0 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.75rem)] z-30 px-4 md:hidden">
        <button
          type="button"
          onClick={() => void onAdd()}
          disabled={addDisabled}
          className="sf-btn-primary w-full justify-between gap-3 py-4 shadow-lg shadow-neutral-900/30"
        >
          <span className="text-sm font-semibold">{busy ? t('adding') : t('addToCart')}</span>
          <span className="flex items-baseline gap-2">
            <span className="text-base font-semibold">{formatMoney(price, locale)}</span>
            {showCompare ? (
              <span className="text-xs text-white/60 line-through">
                {formatMoney(product.compareAtPrice as number, locale)}
              </span>
            ) : null}
          </span>
        </button>
      </div>
    </div>
  );
}

function SizeRow({
  label,
  options,
  value,
  onChange,
  action,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (next: string) => void;
  /** Optional control shown under the chips — the size-chart link. */
  action?: React.ReactNode;
}) {
  return (
    <fieldset className="w-full">
      <legend className="mb-1.5 text-sm font-medium text-neutral-900">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={cn('sf-chip', value === option ? 'sf-chip-selected' : 'sf-chip-unselected')}
          >
            {option}
          </button>
        ))}
      </div>
      {/* Under the chips, not beside the label: the question "which of these
          is me?" only arises once the sizes are in front of you, so the chart
          sits where the eye already is. */}
      {action ? <div className="mt-2">{action}</div> : null}
    </fieldset>
  );
}

/**
 * Filled circular swatches per the reference's "Color" row, using each
 * colour's real hex from the variant data (StorefrontProduct.variants[].colorHex).
 * A colour with no hex on any variant gets a plain neutral swatch instead of
 * an invented one — the name is still readable via the label, aria-label and
 * title.
 */
function ColourRow({
  label,
  options,
  swatches,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  swatches: Map<string, string | null>;
  value: string | null;
  onChange: (next: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-neutral-900">
        {label}
        {value ? <span className="ms-1.5 font-normal text-neutral-500">{value}</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2.5">
        {options.map((option) => {
          const hex = swatches.get(option);
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              aria-pressed={active}
              aria-label={option}
              title={option}
              style={hex ? { backgroundColor: hex } : undefined}
              className={cn(
                'h-9 w-9 rounded-full border transition-[box-shadow,border-color] duration-200',
                hex ? 'border-neutral-200' : 'border-neutral-300 bg-neutral-100',
                active ? 'ring-2 ring-neutral-900 ring-offset-2' : 'hover:border-neutral-500',
              )}
            />
          );
        })}
      </div>
    </fieldset>
  );
}

function MinusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
