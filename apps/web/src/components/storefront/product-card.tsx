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
}

export function ProductCard({ product, locale, priority = false, featured = false }: ProductCardProps) {
  const t = useTranslations('product');
  const tShop = useTranslations('shop');

  const image = product.images.find((candidate) => candidate.isPrimary) ?? product.images[0];

  return (
    <Link
      href={`/product/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-sand-200 bg-white transition-shadow duration-200 hover:shadow-lg focus-visible:shadow-lg"
    >
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
  );
}
