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
    <div className="flex flex-col-reverse lg:flex-row gap-4">
      {images.length > 1 ? (
        <ul className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto lg:overflow-x-hidden pb-1 lg:pb-0 lg:pr-1 lg:h-[calc(100vh-200px)] lg:max-h-[800px] shrink-0">
          {images.map((image, index) => (
            <li key={image.url}>
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-current={index === activeIndex}
                className={clsx(
                  'relative h-20 w-16 shrink-0 overflow-hidden rounded border-2 transition-colors duration-200',
                  index === activeIndex ? 'border-brand-600' : 'border-sand-200 hover:border-brand-400',
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

      <div className="relative aspect-[3/4] flex-1 overflow-hidden rounded-lg border border-sand-200 bg-sand-100">
        <Image
          key={activeIndex}
          src={active!.url}
          alt={active!.alt ?? alt}
          fill
          sizes="(min-width: 1024px) 45vw, 100vw"
          priority
          className="object-cover animate-fadeIn"
        />
      </div>
    </div>
  );
}
