'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime, formatMoney, type Locale } from '@newax/shared';
import { Badge } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { useCountdownLabel } from '@/hooks/use-countdown-label';
import { useFreshOnChange } from '@/hooks/use-fresh-on-change';
import type { LiveConnection } from '@/hooks/use-lot-live';
import { msUntil, shownPriceMinor, timeState, type PublicLot, type Standing } from '@/lib/auction-live';
import { expectsSettlement, settlementCard, type WinnerSettlement } from '@/lib/auction-settlement';
import { LotSettlement } from './lot-settlement';

/**
 * The lot's price: the one figure the page is about. A closed lot that sold
 * shows what it sold for; one that did not shows none, because the highest
 * bid of a lot that missed its reserve is not a price anyone paid.
 */
export function LotFigure({ lot, connection }: { lot: PublicLot; connection: LiveConnection }) {
  const t = useTranslations('auction');
  const locale = useLocale() as Locale;
  const fresh = useFreshOnChange(lot.currentBidMinor);

  if (lot.phase === 'CLOSED' && lot.outcome?.kind !== 'SOLD') return null;

  const label =
    lot.phase === 'CLOSED' ? t('card.finalBid') : lot.currentBidMinor === null ? t('lot.startingBid') : t('lot.currentBid');
  const minor = lot.outcome?.kind === 'SOLD' ? lot.outcome.finalMinor : shownPriceMinor(lot);

  return (
    <div>
      <p className="text-sm text-neutral-900/60">{label}</p>
      <p className="sheen text-3xl font-semibold tabular-nums text-neutral-900 lg:text-4xl" data-fresh={fresh ? 'true' : undefined}>
        {formatMoney(minor, locale)}
      </p>
      {lot.phase === 'OPEN' ? (
        <p className="mt-1 flex items-center gap-2 text-xs text-neutral-900/60">
          {/* The dot is a second cue, never the only one: the sentence says the same. */}
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${connection === 'live' ? 'bg-feedback-positive' : 'bg-neutral-300'}`} />
          {lot.currentBidMinor === null ? `${t('lot.noBidsYet')} · ` : ''}
          {connection === 'live' ? t('lot.live') : connection === 'polling' ? t('lot.polling') : t('lot.connecting')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Time on the lot, counted against the server's clock. Four things it can say:
 * when bidding opens, how long is left (and that it is closing soon), that the
 * time is up and the result is on its way, and that it has ended. Never by
 * colour alone: closing soon is a word.
 */
export function LotClock({ lot, offsetMs, now }: { lot: PublicLot; offsetMs: number; now: number }) {
  const t = useTranslations('auction.lot');
  const locale = useLocale() as Locale;
  const countdown = useCountdownLabel();

  if (now === 0) return <div aria-hidden="true" className="skeleton h-14 w-40 rounded" />;

  const state = timeState(lot, offsetMs, now);

  if (state === 'ended') {
    return lot.phase === 'CLOSED' ? (
      <p className="text-sm font-medium text-neutral-900">{t('ended')}</p>
    ) : (
      <p role="status" className="notice notice-info">
        {t('closing')}
      </p>
    );
  }

  if (state === 'upcoming') {
    return (
      <div>
        <p className="text-sm text-neutral-900/60">{t('opensIn')}</p>
        <p role="timer" className="text-2xl font-semibold tabular-nums text-neutral-900">
          {countdown(msUntil(lot.auction.startsAt, offsetMs, now))}
        </p>
        <p className="text-sm text-neutral-900/60">{t('opensAt', { date: formatDateTime(lot.auction.startsAt, locale) })}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-sm text-neutral-900/60">{t('timeLeft')}</p>
        {state === 'closing-soon' ? <Badge tone="warning">{t('closingSoon')}</Badge> : null}
      </div>
      <p role="timer" className="text-2xl font-semibold tabular-nums text-neutral-900">
        {countdown(msUntil(lot.endsAt, offsetMs, now))}
      </p>
      <p className="text-sm text-neutral-900/60">{t('endsAt', { date: formatDateTime(lot.endsAt, locale) })}</p>
      {lot.extended ? <p className="mt-1 text-sm text-neutral-900/60">{t('extended')}</p> : null}
    </div>
  );
}

/** Where a signed-in bidder stands: leading or outbid, in words. Nothing for someone who has not bid. */
export function LotStanding({ standing, minimumMinor }: { standing: Standing; minimumMinor: number | null }) {
  const t = useTranslations('auction.standing');
  const locale = useLocale() as Locale;

  if (standing === 'leading') {
    return (
      <div role="status" className="notice notice-success grid gap-1">
        <p className="font-medium">{t('leading')}</p>
        <p>{t('leadingNext')}</p>
      </div>
    );
  }
  if (standing === 'outbid') {
    return (
      <div role="status" className="notice notice-error grid gap-1">
        <p className="font-medium">{t('outbid')}</p>
        {minimumMinor !== null ? <p>{t('outbidNext', { minimum: formatMoney(minimumMinor, locale) })}</p> : null}
      </div>
    );
  }
  return null;
}

/**
 * How a closed lot ended, and the way on. A buyer (or a bidder the lot was
 * offered to afterwards) sees what they owe in place of the sold line: the line
 * says what happened to the lot, the card says what happens to them next.
 */
export function LotOutcome({ lot, viewerAlias, settlement }: { lot: PublicLot; viewerAlias: string | null; settlement?: WinnerSettlement | null }) {
  const t = useTranslations('auction.outcome');
  const locale = useLocale() as Locale;
  const outcome = lot.outcome;
  if (lot.phase !== 'CLOSED' || !outcome) return null;

  const card = settlementCard(settlement, expectsSettlement(outcome, lot.phase, viewerAlias));
  if (card) {
    return (
      <div className="grid gap-4">
        <LotSettlement card={card} />
        <Link href={ROUTES.storefront.auctions} className="btn-secondary justify-self-start">
          {t('action')}
        </Link>
      </div>
    );
  }

  const won = outcome.kind === 'SOLD' && viewerAlias !== null && outcome.topBidderAlias === viewerAlias;
  const text =
    outcome.kind === 'SOLD'
      ? won
        ? t('youWon', { price: formatMoney(outcome.finalMinor, locale) })
        : t('soldTo', { alias: outcome.topBidderAlias, price: formatMoney(outcome.finalMinor, locale) })
      : outcome.reason === 'NO_BIDS'
        ? t('noBids')
        : t('reserveNotMet');

  return (
    <div className="grid gap-4">
      <p role="status" className={won ? 'notice notice-success' : 'notice notice-info'}>
        {text}
      </p>
      <Link href={ROUTES.storefront.auctions} className="btn-secondary justify-self-start">
        {t('action')}
      </Link>
    </div>
  );
}
