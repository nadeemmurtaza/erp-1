'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { formatMoney } from '@newax/shared';
import { Link } from '@/i18n/navigation';
import type { StorefrontProduct } from '@/types/api';
import { useCart } from './cart-provider';

interface Props {
  /** The product page this widget lives on — always included, never removable. */
  anchor: StorefrontProduct;
  /** Co-occurrence suggestions only (WO-9.6's own separation from "related products"). */
  items: StorefrontProduct[];
}

/** The variant a bundle add-to-cart uses for a product it did not let the customer configure — the first one actually in stock. */
function defaultVariant(product: StorefrontProduct) {
  return product.variants.find((v) => v.inStock) ?? product.variants[0] ?? null;
}

/**
 * WO-9.6 — "Frequently bought together — co-occurrence in OrderItem, no AI
 * needed at all." A distinct, separate widget from "Related products":
 * every item here starts pre-selected and contributes to one bundle price,
 * so it reads as a suggested combination rather than a generic grid.
 */
export function FrequentlyBoughtTogether({ anchor, items }: Props) {
  const t = useTranslations('product');
  const { add, error, clearError } = useCart();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.id)));
  const [busy, setBusy] = useState(false);

  const anchorVariant = defaultVariant(anchor);
  const selectedItems = items.filter((item) => selected.has(item.id));
  const bundle = useMemo(() => {
    const withVariants = [
      ...(anchorVariant ? [{ product: anchor, variant: anchorVariant }] : []),
      ...selectedItems
        .map((product) => ({ product, variant: defaultVariant(product) }))
        .filter((entry): entry is { product: StorefrontProduct; variant: NonNullable<ReturnType<typeof defaultVariant>> } => entry.variant !== null),
    ];
    return { withVariants, total: withVariants.reduce((sum, entry) => sum + entry.variant.price, 0) };
  }, [anchor, anchorVariant, selectedItems]);

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addBundle(): Promise<void> {
    setBusy(true);
    clearError();
    try {
      for (const entry of bundle.withVariants) {
        await add({ variantId: entry.variant.id, quantity: 1 });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!anchorVariant) return null;

  return (
    <section className="mt-12 border-t border-neutral-100 pt-8">
      <h2 className="font-display text-xl font-semibold text-neutral-900">{t('frequentlyBoughtTogether')}</h2>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <BundleThumb product={anchor} locked />
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <span className="text-lg text-neutral-300" aria-hidden="true">
              +
            </span>
            <BundleThumb product={item} checked={selected.has(item.id)} onToggle={() => toggle(item.id)} />
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">
          {t('bundleTotal', { count: bundle.withVariants.length })}{' '}
          <span className="font-semibold text-neutral-900">{formatMoney(bundle.total)}</span>
        </p>
        <button
          type="button"
          disabled={busy || bundle.withVariants.length === 0}
          onClick={() => void addBundle()}
          className="btn-primary disabled:opacity-50"
        >
          {t('addBundleToCart', { count: bundle.withVariants.length })}
        </button>
      </div>

      {error ? (
        <p role="alert" className="notice notice-error mt-3">
          {error}
        </p>
      ) : null}
    </section>
  );

  function BundleThumb({
    product,
    locked,
    checked,
    onToggle,
  }: {
    product: StorefrontProduct;
    locked?: boolean;
    checked?: boolean;
    onToggle?: () => void;
  }) {
    const image = product.images.find((i) => i.isPrimary) ?? product.images[0];
    return (
      <div className="flex w-20 flex-col items-center gap-1.5 text-center">
        <Link
          href={`/product/${product.slug}`}
          className="relative block h-16 w-16 overflow-hidden rounded-lg bg-neutral-50"
        >
          {image ? <Image src={image.url} alt="" fill sizes="64px" className="object-cover" /> : null}
        </Link>
        <label className="flex items-center gap-1 text-[11px] text-neutral-500">
          {locked ? (
            <span>{t('thisItem')}</span>
          ) : (
            <>
              <input
                type="checkbox"
                checked={checked}
                onChange={onToggle}
                className="field-check"
                aria-label={product.name}
              />
              <span className="line-clamp-1">{formatMoney(defaultVariant(product)?.price ?? product.basePrice)}</span>
            </>
          )}
        </label>
      </div>
    );
  }
}
