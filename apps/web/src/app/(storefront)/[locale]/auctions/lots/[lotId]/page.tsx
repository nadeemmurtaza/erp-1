'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BidHistory } from '@/components/storefront/auction/bid-history';
import { LotPageSkeleton } from '@/components/storefront/auction/lot-skeleton';
import { LotBidding } from '@/components/storefront/auction/lot-bidding';
import { LotJoin } from '@/components/storefront/auction/lot-registration';
import { LotCosts } from '@/components/storefront/auction/lot-settlement';
import { LotClock, LotFigure, LotOutcome } from '@/components/storefront/auction/lot-status';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { Button, Disclosure, EmptyState } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { useLotLive } from '@/hooks/use-lot-live';
import { useLotViewer } from '@/hooks/use-lot-viewer';
import { useNow } from '@/hooks/use-now';


/**
 * The lot page (launchpad-apps/234-auction-app.md §11, WO-234.4): the money
 * page, and its one job is placing a bid. Anyone may read it, signed in or not;
 * only the bid box needs an account. The price and the bids follow the server's
 * live stream, with a five-second read in its place when there is none
 * (`useLotLive`), and the countdown runs on the server's clock.
 */
export default function LotPage() {
  const t = useTranslations('auction');
  const { lotId } = useParams<{ lotId: string }>();
  const { lot, load, connection, offsetMs, refresh, applyEvent } = useLotLive(lotId);
  const { user } = useCustomerSession();
  const lotViewer = useLotViewer(lotId, user !== null, lot ? { phase: lot.phase, outcome: lot.outcome } : null);
  const now = useNow(1_000, lot !== null && lot.phase !== 'CLOSED');

  useEffect(() => {
    if (lot) document.title = `${lot.title} · ${t('title')}`;
  }, [lot, t]);

  if (load === 'loading' || (load === 'ready' && !lot)) return <LotPageSkeleton />;

  if (load === 'missing') {
    return (
      <div className="container-page py-8 lg:py-12">
        <EmptyState
          title={t('missing.title')}
          description={t('missing.body')}
          action={
            <Link href={ROUTES.storefront.auctions} className="btn-primary">
              {t('missing.action')}
            </Link>
          }
        />
      </div>
    );
  }

  if (load === 'error' || !lot) {
    return (
      <div className="container-page py-8 lg:py-12">
        <EmptyState
          title={t('loadError.title')}
          description={t('loadError.body')}
          action={<Button onClick={() => void refresh()}>{t('loadError.action')}</Button>}
        />
      </div>
    );
  }

  const viewerAlias = lotViewer.viewer?.alias ?? null;

  return (
    <div className="container-page py-8 lg:py-12">
      <Link href={ROUTES.storefront.auctions} className="inline-flex min-h-touch items-center text-sm font-medium text-accent-hover hover:underline fold:min-h-0">
        {t('lot.back')}
      </Link>

      <header className="mt-4 max-w-prose">
        <p className="eyebrow">{t('lot.lotOf', { number: lot.lotNo, auction: lot.auction.title })}</p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight text-neutral-900 lg:text-3xl">{lot.title}</h1>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* The bid panel comes first in the page, so on a phone it sits straight under the title and a keyboard reaches it first; from lg it sits to the right. */}
        <aside className="card grid gap-5 p-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
          <LotFigure lot={lot} connection={connection} />
          <LotClock lot={lot} offsetMs={offsetMs} now={now} />
          <LotCosts lot={lot} />
          {lot.phase === 'OPEN' ? <LotBidding lot={lot} lotViewer={lotViewer} offsetMs={offsetMs} now={now} applyEvent={applyEvent} refresh={refresh} /> : null}
          {lot.phase === 'UPCOMING' ? <LotJoin lot={lot} lotViewer={lotViewer} /> : null}
          <LotOutcome lot={lot} viewerAlias={viewerAlias} settlement={lotViewer.viewer?.settlement} />
        </aside>

        <div className="grid gap-8 lg:col-start-1 lg:row-start-1">
          {lot.description || lot.quantity > 1 ? (
            <section className="grid max-w-prose gap-2">
              {lot.description ? <p className="whitespace-pre-line text-neutral-900/80">{lot.description}</p> : null}
              {lot.quantity > 1 ? <p className="text-sm text-neutral-900/60">{t('lot.quantity', { count: lot.quantity })}</p> : null}
            </section>
          ) : null}

          <BidHistory bids={lot.bids} total={lot.bidSeq} viewerAlias={viewerAlias} />

          {lot.auction.terms ? (
            <Disclosure label={t('lot.terms')} className="mt-0">
              <p className="max-w-prose whitespace-pre-line text-sm text-neutral-900/70">{lot.auction.terms}</p>
            </Disclosure>
          ) : null}
        </div>
      </div>
    </div>
  );
}
