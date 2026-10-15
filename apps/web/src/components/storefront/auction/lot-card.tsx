'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime, formatMoney, type Locale } from '@newax/shared';
import { Badge, useTilt } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { useCountdownLabel } from '@/hooks/use-countdown-label';
import { CLOSING_SOON_MS, msUntil, type PublicLotSummary } from '@/lib/auction-live';

/**
 * One lot in the list: what it is, what it is at, and when it ends. The whole
 * card is the link (a lot has one thing to do, open it), so there is no button
 * inside it. It looks like one: the card recipe's lit surface and its shadow-drawn
 * edge at rest (`card-lit`, CRD-4), the lift and the deeper shadow when the pointer or focus arrives
 * (`lift`, CRD-6), a lean of a few degrees toward the pointer (`tilt`), and an arrow at the end that is there at rest too, because
 * hover does not exist on a phone (`ACC-7`). Time on an open lot is counted against the server's clock
 * (`offsetMs`), so a device with a wrong clock is not shown a wrong ending.
 */
export function LotCard({ lot, now, offsetMs }: { lot: PublicLotSummary; now: number; offsetMs: number }) {
  const t = useTranslations('auction.card');
  const tLot = useTranslations('auction.lot');
  const locale = useLocale() as Locale;
  const countdown = useCountdownLabel();
  // A photograph that cannot be fetched is left out, not shown as a broken image (ITG-3); the card reads fine without it.
  const [coverLost, setCoverLost] = useState(false);
  const tilt = useTilt<HTMLAnchorElement>();

  const left = lot.phase === 'OPEN' && now > 0 ? msUntil(lot.endsAt, offsetMs, now) : null;
  const sold = lot.outcome?.kind === 'SOLD' ? lot.outcome : null;

  // The figure: a closed lot that did not sell shows none, the highest bid stays private to the ledger.
  const figure =
    lot.phase === 'CLOSED'
      ? sold
        ? { label: t('finalBid'), minor: sold.finalMinor }
        : null
      : lot.currentBidMinor !== null
        ? { label: t('currentBid'), minor: lot.currentBidMinor }
        : { label: t('startingBid'), minor: lot.startPriceMinor };

  return (
    <Link
      href={ROUTES.storefront.auctionLot(lot.lotId)}
      ref={tilt.ref}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      className="group lift tilt card-lit flex min-h-[10rem] w-full flex-col gap-3 p-5"
    >
      {lot.coverUrl && !coverLost ? (
        // Pulled out to the card's inset (`--inset` 0.5rem) so the corner of the picture follows the card's (CRD-5). The title below names it, so the picture itself is decoration.
        <div className="media-concentric relative -mx-3 -mt-3 aspect-[4/3] overflow-hidden bg-neutral-50">
          <Image
            src={lot.coverUrl}
            alt=""
            fill
            sizes="(min-width: 1536px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            onError={() => setCoverLost(true)}
          />
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow min-w-0">
          {t('lot', { number: lot.lotNo })} · {lot.auction.title}
        </p>
        <ArrowRight
          aria-hidden="true"
          className="h-icon-md w-icon-md shrink-0 text-neutral-900/60 transition-colors duration-normal ease-standard group-hover:text-neutral-900 group-focus-visible:text-neutral-900 rtl:rotate-180"
        />
      </div>
      <h2 className="line-clamp-2 text-base font-medium text-neutral-900">{lot.title}</h2>

      <div>
        {figure ? (
          <>
            <p className="text-xs text-neutral-900/60">{figure.label}</p>
            <p className="text-xl font-semibold tabular-nums text-neutral-900">{formatMoney(figure.minor, locale)}</p>
          </>
        ) : (
          <p className="text-base font-medium text-neutral-900/70">{t('notSold')}</p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-neutral-900/60">
        <span className="inline-flex items-center gap-2">
          {lot.phase === 'OPEN' && left !== null && left > 0 ? <span aria-hidden="true" className="live-dot" /> : null}
          {lot.phase === 'OPEN'
            ? left === null
              ? null
              : left > 0
                ? t('endsIn', { time: countdown(left) })
                : t('closing')
            : lot.phase === 'UPCOMING'
              ? tLot('opensAt', { date: formatDateTime(lot.startsAt, locale) })
              : t('ended')}
        </span>
        {left !== null && left > 0 && left <= CLOSING_SOON_MS ? (
          <Badge tone="warning">
            {tLot('closingSoon')}
          </Badge>
        ) : null}
        <span className="tabular-nums">{t('bids', { count: lot.bidCount })}</span>
      </div>
    </Link>
  );
}
