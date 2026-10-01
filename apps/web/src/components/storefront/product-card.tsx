'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { Locale } from '@newax/shared';
import { Link } from '@/i18n/navigation';
import type { StorefrontProduct } from '@/types/api';
import { useWishlist } from '@/lib/wishlist';
import { Price } from './price';

interface ProductCardProps {
  product: StorefrontProduct;
  locale: Locale;
  /** True for the first row, so above-the-fold images are not lazy-loaded. */
  priority?: boolean;
  /** Larger featured card layout */
  featured?: boolean;
  /** Callback when quick view is clicked */
  onQuickView?: () => void;
}

export function ProductCard({
  product,
  locale,
  priority = false,
  featured = false,
  onQuickView,
}: ProductCardProps) {
  const t = useTranslations('product');
  const tShop = useTranslations('shop');
  const { isSaved, toggle } = useWishlist();
  const saved = isSaved(product.id);

  const primary = product.images.find((candidate) => candidate.isPrimary) ?? product.images[0];
  // The swap-on-hover shot. Only meaningful when it is a different photograph
  // from the one already on screen.
  const secondary = product.images.find((candidate) => candidate.url !== primary?.url);

  const sizes = [...new Set(product.variants.map((variant) => variant.size).filter(Boolean))];

  const discount =
    product.compareAtPrice && product.compareAtPrice > product.fromPrice
      ? Math.round((1 - product.fromPrice / product.compareAtPrice) * 100)
      : null;

  const imageSizes = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw';

  // StorefrontProduct carries no rating/reviewCount field (checked
  // apps/web/src/lib/api-types.ts) — the reference's star row is omitted
  // rather than shown with invented numbers.

  return (
    // `lift` is a transition, not a keyframe — so it eases back out on mouse-leave
    // instead of snapping, which is what an `animate-` class does. `card-lit` is
    // the card recipe's surface (CRD-4) and carries the 8px inset the photograph
    // sits in (CRD-2); `p-2` is that inset, so the two are one number.
    <div className="group lift card-lit flex flex-col p-2">
      {/*
        Its own hover group: the zoom, the image swap and the action overlay all
        belong to the photograph, while the lift belongs to the whole card.
      */}
      <div
        className={`group/media media-concentric relative overflow-hidden bg-neutral-50 ${
          featured ? 'aspect-square' : 'aspect-[3/4]'
        }`}
      >
        {primary ? (
          <>
            <Image
              src={primary.url}
              alt={primary.alt ?? product.name}
              fill
              sizes={imageSizes}
              priority={priority}
              className={`object-cover transition-[transform,opacity] duration-sweep ease-decelerate motion-safe:group-hover/media:scale-105 ${
                secondary ? 'group-hover/media:opacity-0' : ''
              }`}
            />

            {secondary ? (
              <Image
                src={secondary.url}
                alt=""
                aria-hidden="true"
                fill
                sizes={imageSizes}
                className="object-cover opacity-0 transition-[transform,opacity] duration-sweep ease-decelerate group-hover/media:opacity-100 motion-safe:group-hover/media:scale-105"
              />
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-neutral-400">
            {t('noImage')}
          </div>
        )}

        {/* Covers the photograph so it is still a link, but sits under the buttons. */}
        <Link
          href={`/product/${product.slug}`}
          className="absolute inset-0 z-raised"
          aria-label={product.name}
        />

        {/* Status badges stack at the reading-start corner, clear of the heart button opposite. */}
        <div className="pointer-events-none absolute start-3 top-3 z-raised-2 flex flex-col items-start gap-2">
          {discount !== null ? (
            <span data-theme="light" className="rounded bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white">
              -{discount}%
            </span>
          ) : null}

          {!product.inStock ? (
            <span data-theme="light" className="rounded bg-neutral-900/90 px-2.5 py-1 text-xs font-medium text-white">
              {t('outOfStock')}
            </span>
          ) : product.stitchingAvailable ? (
            <span data-theme="light" className="rounded bg-neutral-700 px-2.5 py-1 text-xs font-medium text-white">
              {t('getItStitched')}
            </span>
          ) : null}
        </div>

        {/*
          Always-visible floating wishlist toggle, per the reference — unlike quick
          view/quick shop below, this is not a hover-only affordance, since it needs
          to be reachable on touch devices with no hover state. Stopping propagation
          keeps a tap from also following the full-bleed link behind it.
        */}
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            toggle(product.id);
          }}
          className="absolute end-3 top-3 z-raised-3 icon-btn"
          aria-label={saved ? t('removeFromFavourites') : t('addToFavourites')}
          aria-pressed={saved}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={saved ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z" />
          </svg>
        </button>

        {/*
          `pointer-events-none` keeps the full-bleed scrim transparent to clicks.
          Only the buttons and size strip get pointer-events-auto on hover so
          they're clickable while the dead space falls through to the z-raised link.
          focus-within ensures the overlay opens when keyboard focus lands in the
          button group, making the focus ring visible. Sits below the wishlist
          button's z-raised-3 so that toggle stays reachable while the scrim is up.
        */}
        <div className="pointer-events-none absolute inset-0 z-raised-2 flex flex-col items-center justify-center gap-4 bg-scrim/30 opacity-0 transition-opacity duration-slow ease-decelerate group-hover/media:opacity-100 group-focus-within/media:opacity-100">
          <div className="pointer-events-none flex items-center gap-3 group-hover/media:pointer-events-auto group-focus-within/media:pointer-events-auto">
            {onQuickView ? (
              <button
                type="button"
                onClick={onQuickView}
                className="group/btn relative flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-neutral-900 backdrop-blur-sm transition-transform duration-normal hover:scale-110"
                aria-label={t('quickView')}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            ) : null}
          </div>

          <button
            type="button"
            className="pointer-events-none btn-primary group-hover/media:pointer-events-auto group-focus-within/media:pointer-events-auto"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <span>{t('quickShop')}</span>
          </button>

          {sizes.length > 0 ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs font-medium tracking-wide text-white group-hover/media:pointer-events-auto group-focus-within/media:pointer-events-auto">
              {sizes.join(', ')}
            </div>
          ) : null}
        </div>
      </div>

      {/*
        The body (CRD-1, CRD-2): 16px from the card's edge (the card's 8px inset
        plus this 8px), 16px under the photograph, 8px between lines. The title is
        the heaviest line of text, the details are the quietest, and the price —
        the one thing the reader is here to compare — is larger than both.
      */}
      <Link href={`/product/${product.slug}`} className="flex flex-1 flex-col gap-2 px-2 pb-2 pt-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-neutral-900 transition-colors duration-normal group-hover:text-neutral-600">
          {product.name}
        </h3>

        <p className="flex flex-wrap gap-x-3 text-xs text-neutral-500">
          {product.fabric ? <span className="capitalize">{product.fabric}</span> : null}
          {product.pieceCount ? (
            <span>{tShop('pieceCount', { count: product.pieceCount })}</span>
          ) : null}
        </p>

        <div className="mt-auto pt-1">
          <Price
            amount={product.fromPrice}
            compareAt={product.compareAtPrice}
            locale={locale}
            tone="accent"
            className="text-lg"
          />
        </div>
      </Link>
    </div>
  );
}
