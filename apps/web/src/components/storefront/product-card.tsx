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

export function ProductCard({ product, locale, priority = false, featured = false, onQuickView }: ProductCardProps) {
  const t = useTranslations('product');
  const tShop = useTranslations('shop');

  const image = product.images.find((candidate) => candidate.isPrimary) ?? product.images[0];

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-sand-200 bg-white transition-all duration-300 motion-safe:hover:animate-liftUp">
      <Link href={`/product/${product.slug}`} className="flex flex-col flex-1">
        <div className={`relative overflow-hidden bg-sand-100 ${featured ? 'aspect-square' : 'aspect-[3/4]'}`}>
          {image ? (
            <Image
              src={image.url}
              alt={image.alt ?? product.name}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              priority={priority}
              className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-ink/40">
              {t('noImage')}
            </div>
          )}

          {product.compareAtPrice && product.compareAtPrice > product.fromPrice ? (
            <span className="absolute start-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
              -{Math.round((1 - product.fromPrice / product.compareAtPrice) * 100)}%
            </span>
          ) : null}

          {!product.inStock ? (
            <span className="absolute start-2 top-2 rounded bg-ink/80 px-2 py-1 text-xs font-medium text-white">
              {t('outOfStock')}
            </span>
          ) : null}

          {product.stitchingAvailable ? (
            <span className="absolute end-2 top-2 rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white">
              {t('getItStitched')}
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
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
            <Price
              amount={product.fromPrice}
              compareAt={product.compareAtPrice}
              locale={locale}
            />
          </div>
        </div>
      </Link>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/40 p-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {/* Icon buttons */}
        <div className="flex gap-6 bg-black/80 px-6 py-3 rounded">
          {onQuickView && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onQuickView();
              }}
              className="flex items-center justify-center text-white hover:opacity-70 transition-opacity"
              aria-label="Quick view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          )}
          <button className="flex items-center justify-center text-white hover:opacity-70 transition-opacity" aria-label="Quick shop">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor">
              <path d="M2 9a1 1 0 011-1h1.05a2 2 0 011.82 1.1l1.07 1.605a1 1 0 00.6.472l1.393.464a1 1 0 11-.606 1.918l-1.393-.464-1.607-2.41A4 4 0 014.05 9H3a1 1 0 01-1-1z" />
              <path d="M16 7a2 2 0 110-4 2 2 0 010 4zm-3 7a1 1 0 11-2 0 1 1 0 012 0zm8 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
          </button>
        </div>

        {/* Quick Shop button */}
        <button className="bg-black/80 text-white px-8 py-2.5 text-sm font-medium hover:bg-black transition-colors">
          Quick Shop
        </button>

        {/* Size selector */}
        <div className="absolute bottom-4 start-4 text-white text-xs font-medium">
          S, M, L, XL
        </div>
      </div>
    </div>
  );
}
