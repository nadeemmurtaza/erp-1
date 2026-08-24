'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import clsx from 'clsx';
import { Link } from '@/i18n/navigation';
import type { ProductImage } from '@/lib/api-types';
import { useWishlist } from '@/lib/wishlist';

interface ProductGalleryProps {
  images: ProductImage[];
  alt: string;
  /** So the floating heart button can toggle this exact product. */
  productId: string;
  /** Where the mobile-only floating back button returns to — the category
   * listing the customer likely arrived from, or the shop root. */
  backHref: string;
}

export function ProductGallery({ images, alt, productId, backHref }: ProductGalleryProps) {
  const t = useTranslations('product');
  const [activeIndex, setActiveIndex] = useState(0);
  const { isSaved, toggle } = useWishlist();
  const saved = isSaved(productId);
  const active = images[activeIndex];

  if (images.length === 0) {
    return (
      <div className="flex aspect-[3/4] items-center justify-center rounded-2xl bg-noir-50 text-sm text-noir-400">
        {t('noImage')}
      </div>
    );
  }

  return (
    <div className="flex flex-col-reverse gap-4 lg:flex-row">
      {images.length > 1 ? (
        <ul className="flex shrink-0 gap-2 overflow-x-auto pb-1 lg:h-[calc(100vh-200px)] lg:max-h-[800px] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:pb-0 lg:pe-1">
          {images.map((image, index) => (
            <li key={image.url}>
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-current={index === activeIndex}
                className={clsx(
                  'relative h-20 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors duration-200',
                  index === activeIndex
                    ? 'border-noir-900'
                    : 'border-noir-200 hover:border-noir-400',
                )}
              >
                <Image
                  src={image.url}
                  alt={image.alt ?? `${alt} ${index + 1}`}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        Full-bleed hero, per the reference: below lg: this cancels the page
        container's own horizontal padding (container-page's px-4 sm:px-6) so
        the photo reaches the viewport edge, with the back/heart buttons
        floating on top of it. At lg: the two-column layout takes over and the
        image sits inside its own rounded card instead — no bleed needed once
        it is no longer the full screen width.
      */}
      <div className="relative -mx-4 aspect-[3/4] flex-1 overflow-hidden bg-noir-50 sm:-mx-6 lg:mx-0 lg:rounded-2xl">
        <Image
          key={activeIndex}
          src={active!.url}
          alt={active!.alt ?? alt}
          fill
          sizes="(min-width: 1024px) 45vw, 100vw"
          priority
          className="animate-fadeIn object-cover"
        />

        {/*
          Mobile-only: at md: and up the two-column layout sits beside a
          breadcrumb, which is affordance enough to get back.
        */}
        <Link
          href={backHref}
          aria-label={t('backToShop')}
          className="absolute start-3 top-3 z-20 h-10 w-10 sf-icon-btn md:hidden"
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
            className="rtl:-scale-x-100"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>

        <button
          type="button"
          onClick={() => toggle(productId)}
          aria-label={saved ? t('removeFromFavourites') : t('addToFavourites')}
          aria-pressed={saved}
          className="absolute end-3 top-3 z-20 h-10 w-10 sf-icon-btn"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="19"
            height="19"
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
      </div>
    </div>
  );
}
