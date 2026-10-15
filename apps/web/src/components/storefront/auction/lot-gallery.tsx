'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/cn';
import { clampPhotoIndex, photoPosition } from '@/lib/auction-lot-photos';

/**
 * A lot's photographs (launchpad-apps/234-auction-app.md §11, WO-234.12): one
 * large picture and, when there is more than one, a row of small ones to choose
 * from. The large picture is shown whole (`object-contain` on a quiet ground),
 * never cropped, because a buyer is judging the condition of what they bid on.
 * A lot with no photograph renders nothing at all: no frame, no placeholder,
 * no broken image. A photograph that cannot be fetched says so in words, in the
 * large frame, instead of showing the browser's broken-image icon (ITG-3).
 *
 * The thumbnails are real buttons, so the keyboard and a screen reader reach
 * them, each at least 44 px square below `fold` (ACC-4); the one on show is
 * marked `aria-current`. Picking is a state change with no motion of its own.
 */
export function LotGallery({
  images,
  lotNo,
  title,
  className,
}: {
  images: ReadonlyArray<{ url: string }>;
  lotNo: number;
  title: string;
  className?: string;
}) {
  const t = useTranslations('auction.lot.photos');
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());

  if (images.length === 0) return null;

  const index = clampPhotoIndex(active, images.length);
  const current = images[index]!;
  const lost = broken.has(current.url);
  const markBroken = (url: string) => setBroken((previous) => new Set([...previous, url]));

  return (
    <section aria-label={t('gallery', { number: lotNo })} className={cn('grid gap-3', className)}>
      <div className="media-concentric relative aspect-[4/3] w-full overflow-hidden bg-neutral-50 shadow-card">
        {lost ? (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-neutral-900/70">{t('photoMissing')}</p>
        ) : (
          <Image
            // Keyed so a new choice is a new image, not the old one stretched while the next loads.
            key={current.url}
            src={current.url}
            alt={t('photoAlt', { number: lotNo, title, ...photoPosition(index, images.length) })}
            fill
            sizes="(min-width: 1024px) 60vw, 100vw"
            priority={index === 0}
            className="object-contain"
            onError={() => markBroken(current.url)}
          />
        )}
      </div>

      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, position) => {
            const { n, total } = photoPosition(position, images.length);
            return (
              <li key={image.url} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setActive(position)}
                  aria-label={t('showPhoto', { n, total })}
                  aria-current={position === index ? 'true' : undefined}
                  className={cn(
                    'media-concentric focus-frame relative block h-touch w-touch overflow-hidden border bg-neutral-50 fold:h-12 fold:w-16',
                    position === index ? 'border-neutral-900 shadow-raised' : 'border-neutral-100',
                  )}
                >
                  {broken.has(image.url) ? null : (
                    <Image src={image.url} alt="" fill sizes="64px" className="object-cover" onError={() => markBroken(image.url)} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
