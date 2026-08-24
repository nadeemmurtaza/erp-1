'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { Locale } from '@yaseen/shared';
import { Link } from '@/i18n/navigation';
import type { StorefrontProduct } from '@/lib/api-types';
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
    // instead of snapping, which is what an `animate-` class does.
    <div className="group lift flex flex-col">
      {/*
        Its own hover group: the zoom, the image swap and the action overlay all
        belong to the photograph, while the lift belongs to the whole card.
      */}
      <div
        className={`group/media relative overflow-hidden rounded-2xl bg-noir-50 ${
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
              className={`object-cover transition-[transform,opacity] duration-700 ease-out motion-safe:group-hover/media:scale-105 ${
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
                className="object-cover opacity-0 transition-[transform,opacity] duration-700 ease-out group-hover/media:opacity-100 motion-safe:group-hover/media:scale-105"
              />
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-noir-400">
            {t('noImage')}
          </div>
        )}

        {/* Covers the photograph so it is still a link, but sits under the buttons. */}
        <Link
          href={`/product/${product.slug}`}
          className="absolute inset-0 z-10"
          aria-label={product.name}
        />

        {/* Status badges stack at the reading-start corner, clear of the heart button opposite. */}
        <div className="pointer-events-none absolute start-3 top-3 z-20 flex flex-col items-start gap-2">
          {discount !== null ? (
            <span className="rounded-full bg-noir-900 px-2.5 py-1 text-xs font-semibold text-white">
              -{discount}%
            </span>
          ) : null}

          {!product.inStock ? (
            <span className="rounded-full bg-noir-900/90 px-2.5 py-1 text-xs font-medium text-white">
              {t('outOfStock')}
            </span>
          ) : product.stitchingAvailable ? (
            <span className="rounded-full bg-noir-700 px-2.5 py-1 text-xs font-medium text-white">
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
          className="absolute end-3 top-3 z-30 sf-icon-btn"
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
          they're clickable while the dead space falls through to the z-10 link.
          focus-within ensures the overlay opens when keyboard focus lands in the
          button group, making the focus ring visible. Sits below the wishlist
          button's z-30 so that toggle stays reachable while the scrim is up.
        */}
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-noir-900/30 opacity-0 transition-opacity duration-300 ease-out group-hover/media:opacity-100 group-focus-within/media:opacity-100">
          <div className="pointer-events-none flex items-center gap-3 group-hover/media:pointer-events-auto group-focus-within/media:pointer-events-auto">
            {onQuickView ? (
              <button
                type="button"
                onClick={onQuickView}
                className="group/btn relative flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-noir-900 backdrop-blur-sm transition-transform duration-200 hover:scale-110"
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
            className="pointer-events-none transition-all hover:scale-105 sf-btn-primary group-hover/media:pointer-events-auto group-focus-within/media:pointer-events-auto"
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

      <Link href={`/product/${product.slug}`} className="flex flex-1 flex-col gap-1.5 pt-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-noir-900 transition-colors duration-200 group-hover:text-noir-600">
          {product.name}
        </h3>

        <p className="flex flex-wrap gap-x-3 text-xs text-noir-500">
          {product.fabric ? <span className="capitalize">{product.fabric}</span> : null}
          {product.pieceCount ? (
            <span>{tShop('pieceCount', { count: product.pieceCount })}</span>
          ) : null}
        </p>

        <div className="mt-auto pt-1">
          <Price amount={product.fromPrice} compareAt={product.compareAtPrice} locale={locale} />
        </div>
      </Link>
    </div>
  );
}
