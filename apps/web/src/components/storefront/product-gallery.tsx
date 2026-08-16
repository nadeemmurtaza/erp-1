'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import clsx from 'clsx';
import type { ProductImage } from '@/lib/api-types';

export function ProductGallery({
  images,
  alt,
}: {
  images: ProductImage[];
  alt: string;
}) {
  const t = useTranslations('product');
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[activeIndex];

  if (images.length === 0) {
    return (
      <div className="flex aspect-[3/4] items-center justify-center rounded-lg border border-sand-200 bg-sand-100 text-sm text-ink/40">
        {t('noImage')}
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-sand-200 bg-sand-100">
        <Image
          src={active!.url}
          alt={active!.alt ?? alt}
          fill
          sizes="(min-width: 1024px) 45vw, 100vw"
          priority
          className="object-cover"
        />
      </div>

      {images.length > 1 ? (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <li key={image.url}>
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-current={index === activeIndex}
                className={clsx(
                  'relative h-20 w-16 shrink-0 overflow-hidden rounded border-2 transition-colors',
                  index === activeIndex ? 'border-brand-600' : 'border-sand-200',
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
    </div>
  );
}
