'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ApiError } from '@newax/shared';
import { LotCard } from '@/components/storefront/auction/lot-card';
import { RevealScope } from '@/components/ui/reveal-scope';
import { Button, EmptyState, Segmented, SkeletonRegion } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { useNow } from '@/hooks/use-now';
import { fetchPublicLots, type PublicLotPage, type PublicLotState } from '@/lib/auction-client';
import { clockOffset, type PublicLotSummary } from '@/lib/auction-live';

const STATES: readonly PublicLotState[] = ['live', 'upcoming', 'ended'];
const PAGE_SIZE = 12;
/** Wait after the last keystroke before the search goes to the URL and the API. */
const SEARCH_DEBOUNCE_MS = 300;

type Load = 'loading' | 'ready' | 'error' | 'unavailable';

function isState(value: string | null): value is PublicLotState {
  return STATES.includes(value as PublicLotState);
}

/**
 * Auction list (launchpad-apps/234-auction-app.md §11, WO-234.4). One job:
 * find a lot to bid on. The view (live, upcoming, ended) and the search are in
 * the URL, so a refresh, a bookmark and the back button all land where they
 * were. Browsing needs no sign-in.
 */
export default function AuctionsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <AuctionList />
    </Suspense>
  );
}

function AuctionList() {
  const t = useTranslations('auction');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawState = searchParams.get('state');
  const state: PublicLotState = isState(rawState) ? rawState : 'live';
  const query = searchParams.get('q')?.trim() ?? '';

  const [draft, setDraft] = useState(query);
  const [load, setLoad] = useState<Load>('loading');
  const [lots, setLots] = useState<PublicLotSummary[]>([]);
  const [meta, setMeta] = useState<PublicLotPage['meta'] | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const now = useNow(1_000, state === 'live' && lots.length > 0);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // The URL changed from outside (back button, a link): the box follows it.
  useEffect(() => setDraft(query), [query]);

  function onSearch(value: string) {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setParam('q', value.trim() || null), SEARCH_DEBOUNCE_MS);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  // First page, again whenever the view or the search changes (or a retry is asked for).
  useEffect(() => {
    let cancelled = false;
    setLoad('loading');
    setMoreFailed(false);
    fetchPublicLots({ state, q: query || undefined, page: 1, pageSize: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return;
        setLots(page.data);
        setMeta(page.meta);
        setOffsetMs(clockOffset(page.serverTime, Date.now()));
        setLoad('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // The module is off in this deployment: its routes do not exist.
        setLoad(error instanceof ApiError && error.status === 404 ? 'unavailable' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [state, query, attempt]);

  async function showMore() {
    if (!meta) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await fetchPublicLots({ state, q: query || undefined, page: meta.page + 1, pageSize: PAGE_SIZE });
      setLots((current) => [...current, ...page.data.filter((lot) => !current.some((seen) => seen.lotId === lot.lotId))]);
      setMeta(page.meta);
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const stateOptions = STATES.map((value) => ({ value, label: t(`states.${value}`) }));

  return (
    <div className="container-page py-8 lg:py-12">
      <div className="max-w-prose">
        <h1 className="text-2xl font-medium tracking-tight text-neutral-900 lg:text-3xl">{t('title')}</h1>
        <p className="mt-1.5 text-sm text-neutral-900/60">{t('intro')}</p>
      </div>

      {load === 'unavailable' ? (
        <EmptyState
          className="mt-8"
          title={t('list.unavailable.title')}
          description={t('list.unavailable.body')}
          action={
            <Link href={ROUTES.storefront.shop} className="btn-primary">
              {t('list.unavailable.action')}
            </Link>
          }
        />
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Segmented
              label={t('stateLabel')}
              options={stateOptions}
              value={state}
              onChange={(next) => setParam('state', next === 'live' ? null : next)}
            />
            <div className="min-w-0 flex-1 basis-56 sm:max-w-sm">
              <label htmlFor="auction-search" className="sr-only">
                {t('searchLabel')}
              </label>
              <input
                id="auction-search"
                type="search"
                className="field-input w-full"
                value={draft}
                placeholder={t('searchPlaceholder')}
                onChange={(event) => onSearch(event.target.value)}
              />
            </div>
          </div>

          {load === 'loading' ? (
            <ListSkeleton bare />
          ) : load === 'error' ? (
            <EmptyState
              className="mt-8"
              title={t('list.error.title')}
              description={t('list.error.body')}
              action={
                <Button onClick={() => setAttempt((count) => count + 1)}>{t('list.error.action')}</Button>
              }
            />
          ) : lots.length === 0 ? (
            <Empty state={state} query={query} onClear={() => setParam('q', null)} onSwitch={(next) => setParam('state', next === 'live' ? null : next)} />
          ) : (
            <>
              <p className="mt-6 text-sm text-neutral-900/60" aria-live="polite">
                {t('list.resultsCount', { count: meta?.total ?? lots.length })}
              </p>
              <RevealScope as="ul" className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {lots.map((lot) => (
                  <li key={lot.lotId} data-reveal-item="" className="flex">
                    <LotCard lot={lot} now={now} offsetMs={offsetMs} />
                  </li>
                ))}
              </RevealScope>
              {meta?.hasNext ? (
                <div className="mt-8 flex flex-col items-center gap-2">
                  <Button variant="secondary" loading={loadingMore} onClick={showMore}>
                    {t('list.loadMore')}
                  </Button>
                  {moreFailed ? (
                    <p role="alert" className="text-sm text-feedback-negative">
                      <span className="font-medium">{t('list.error.title')}</span> {t('list.error.body')}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Nothing to show, said three different ways: a search that found nothing, a view with no lots, and one that has not had any. */
function Empty({
  state,
  query,
  onClear,
  onSwitch,
}: {
  state: PublicLotState;
  query: string;
  onClear: () => void;
  onSwitch: (state: PublicLotState) => void;
}) {
  const t = useTranslations('auction.list.empty');

  if (query) {
    return (
      <EmptyState
        className="mt-8"
        title={t('search.title', { query })}
        description={t('search.body')}
        action={
          <Button variant="secondary" onClick={onClear}>
            {t('search.action')}
          </Button>
        }
      />
    );
  }

  const other: PublicLotState = state === 'live' ? 'upcoming' : 'live';
  return (
    <EmptyState
      className="mt-8"
      title={t(`${state}.title`)}
      description={t(`${state}.body`)}
      action={
        <Button variant="secondary" onClick={() => onSwitch(other)}>
          {t(`${state}.action`)}
        </Button>
      }
    />
  );
}

function ListSkeleton({ bare = false }: { bare?: boolean }) {
  const grid = (
    <SkeletonRegion className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="card flex min-h-[10rem] flex-col gap-3 p-5">
          <div className="skeleton h-3 w-2/5 rounded" />
          <div className="skeleton h-4 w-4/5 rounded" />
          <div className="skeleton mt-2 h-6 w-1/3 rounded" />
          <div className="skeleton mt-auto h-3 w-3/5 rounded" />
        </div>
      ))}
    </SkeletonRegion>
  );
  if (bare) return grid;
  return (
    <div className="container-page py-8 lg:py-12">
      <div className="skeleton h-8 w-40 rounded-lg" />
      <div className="skeleton mt-3 h-4 w-72 max-w-full rounded" />
      {grid}
    </div>
  );
}
