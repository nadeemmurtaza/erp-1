'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatDateTimeSeconds, formatMoney, type Locale } from '@newax/shared';
import { Badge } from '@/components/ui';
import type { LiveBid } from '@/lib/auction-live';

/**
 * The lot's newest bids, by alias. Names never reach this page: "Bidder 7" is
 * all the API sends. The viewer's own bids are marked, and a bid the system
 * placed from someone's maximum says so, because a run of raises a few seconds
 * apart reads differently when it is known to be automatic.
 */
export function BidHistory({ bids, total, viewerAlias }: { bids: readonly LiveBid[]; total: number; viewerAlias: string | null }) {
  const t = useTranslations('auction.history');
  const locale = useLocale() as Locale;

  return (
    <section aria-labelledby="bid-history-title" className="max-w-prose">
      <h2 id="bid-history-title" className="text-lg font-medium text-neutral-900">
        {t('title')}
      </h2>

      {bids.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-900/60">{t('empty')}</p>
      ) : (
        <>
          <ol className="mt-3">
            {bids.map((bid) => (
              <li key={bid.seq} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-t border-neutral-100 py-3 first:border-t-0">
                <span className="flex flex-wrap items-center gap-2 text-sm text-neutral-900">
                  {bid.alias}
                  {viewerAlias === bid.alias ? <Badge tone="info">{t('you')}</Badge> : null}
                  {bid.kind === 'PROXY_AUTO' ? <Badge>{t('auto')}</Badge> : null}
                </span>
                <span className="font-medium tabular-nums text-neutral-900">{formatMoney(bid.amountMinor, locale)}</span>
                <time dateTime={bid.acceptedAt} className="col-span-2 text-xs text-neutral-900/60">
                  {formatDateTimeSeconds(bid.acceptedAt, locale)}
                </time>
              </li>
            ))}
          </ol>
          {total > bids.length ? <p className="mt-2 text-xs text-neutral-900/60">{t('latest', { count: bids.length })}</p> : null}
        </>
      )}
    </section>
  );
}
