import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { Locale } from '@yaseen/shared';
import { Link } from '@/i18n/navigation';
import type { StorefrontProduct } from '@/lib/api-types';
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

  return (
    // `lift` is a transition, not a keyframe — so it eases back out on mouse-leave
    // instead of snapping, which is what an `animate-` class does.
    <div className="group card lift flex flex-col overflow-hidden">
      {/*
        Its own hover group: the zoom, the image swap and the action overlay all
        belong to the photograph, while the lift belongs to the whole card.
      */}
      <div
        className={`group/media relative overflow-hidden bg-sand-100 ${
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
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-ink/40">
            {t('noImage')}
          </div>
        )}

        {/* Covers the photograph so it is still a link, but sits under the buttons. */}
        <Link
          href={`/product/${product.slug}`}
          className="absolute inset-0 z-10"
          aria-label={product.name}
        />

        <div className="pointer-events-none absolute inset-0 z-20">
          {discount !== null ? (
            <span className="absolute end-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
              -{discount}%
            </span>
          ) : null}

          {!product.inStock ? (
            <span className="absolute start-3 top-3 rounded bg-ink/80 px-2 py-1 text-xs font-medium text-white">
              {t('outOfStock')}
            </span>
          ) : product.stitchingAvailable ? (
            <span className="absolute start-3 top-3 rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white">
              {t('getItStitched')}
            </span>
          ) : null}
        </div>

        {/*
          `pointer-events-none` keeps the full-bleed scrim transparent to clicks.
          Only the buttons and size strip get pointer-events-auto on hover so
          they're clickable while the dead space falls through to the z-10 link.
          focus-within ensures the overlay opens when keyboard focus lands in the
          button group, making the focus ring visible.
        */}
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/25 opacity-0 transition-opacity duration-300 ease-out group-hover/media:opacity-100 group-focus-within/media:opacity-100">
          <div className="pointer-events-none flex items-center gap-3 group-hover/media:pointer-events-auto group-focus-within/media:pointer-events-auto">
            {onQuickView ? (
              <button
                type="button"
                onClick={onQuickView}
                className="group/btn relative flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink transition-transform duration-200 hover:scale-110"
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

            <button
              type="button"
              className="group/btn relative flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink transition-transform duration-200 hover:scale-110"
              aria-label={t('addToFavourites')}
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
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="pointer-events-none flex items-center gap-2 rounded-lg bg-ink px-6 py-3 text-sm font-medium text-white transition-all duration-200 hover:bg-ink/90 hover:scale-105 group-hover/media:pointer-events-auto group-focus-within/media:pointer-events-auto"
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

      <Link href={`/product/${product.slug}`} className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink transition-colors duration-200 group-hover:text-brand-700">
          {product.name}
        </h3>

        <p className="flex flex-wrap gap-x-3 text-xs text-ink/60">
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
