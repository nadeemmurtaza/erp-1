'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney, type Locale } from '@newax/shared';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { Button, Disclosure, Field } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import type { LotViewer } from '@/hooks/use-lot-viewer';
import { placeBid, setProxyBid } from '@/lib/auction-client';
import {
  amountForInput,
  describeBidFailure,
  eventFromAccepted,
  msUntil,
  parseAmountToMinor,
  standingOf,
  type BidFailure,
  type IneligibleWhy,
  type LotLiveEvent,
  type PublicLot,
} from '@/lib/auction-live';
import { registrationCard } from '@/lib/auction-registration';
import { LotRegistration, RegistrationApproved, useLetIn } from './lot-registration';
import { LotStanding } from './lot-status';

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Whether the browser thinks it has a connection. A bid is not queued while it does not: it is sent when the person presses the button, or not at all. */
function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** One request key per intended bid (a UUID is what the API asks for), kept across a retry of the same amount so a bid that arrived but whose answer was lost is never placed twice. */
function newRequestKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Everything a bidder does on an open lot, and nothing else (the bid box of
 * launchpad-apps/234-auction-app.md §11): who they are to the lot (signed out,
 * not yet allowed in, leading, outbid), one amount and one button, and, one level
 * down, a standing maximum. A person who may not bid yet gets the registration
 * card in this place (`LotRegistration`), not a refusal. The rest of the page
 * reads the lot; only this writes to it.
 *
 * What it will not do: queue a bid while offline (it says so instead), place a
 * bid for someone who already leads (the API refuses it, so the box is replaced
 * by the standing and the maximum), or show an API message (a refusal is told in
 * the shopper's language from its code, `describeBidFailure`).
 */
export function LotBidding({
  lot,
  lotViewer,
  offsetMs,
  now,
  applyEvent,
  refresh,
}: {
  lot: PublicLot;
  lotViewer: LotViewer;
  offsetMs: number;
  now: number;
  applyEvent: (event: LotLiveEvent, options?: { clock?: boolean }) => void;
  refresh: () => Promise<void>;
}) {
  const t = useTranslations('auction');
  const locale = useLocale() as Locale;
  const money = (minor: number) => formatMoney(minor, locale);
  const { user, isLoading } = useCustomerSession();
  const online = useOnline();
  const { viewer, setViewer, myMax, setMyMax, reload } = lotViewer;

  const standing = standingOf(viewer?.alias ?? null, viewer?.participating ?? false, lot.bids);
  const letIn = useLetIn(viewer);
  /** Set when this person's own bid was just accepted, so focus can follow the form that is about to be replaced by their standing. */
  const focusStanding = useRef(false);
  const standingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusStanding.current && standing === 'leading') {
      focusStanding.current = false;
      standingRef.current?.focus();
    }
  }, [standing]);

  if (isLoading) return <div aria-hidden="true" className="skeleton h-24 w-full rounded-md" />;

  if (!user) {
    return (
      <div className="grid gap-3">
        <p className="text-base font-medium text-neutral-900">{t('signIn.title')}</p>
        <p className="text-sm text-neutral-900/60">{t('signIn.body')}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={`${ROUTES.storefront.login}?next=${encodeURIComponent(ROUTES.storefront.auctionLot(lot.lotId))}`} className="btn-primary">
            {t('signIn.action')}
          </Link>
          <Link href={ROUTES.storefront.register} className="btn-secondary">
            {t('signIn.register')}
          </Link>
        </div>
      </div>
    );
  }

  const card = registrationCard(viewer);
  if (card) {
    return <LotRegistration card={card} lot={lot} mode={viewer?.registration?.mode ?? 'APPROVAL'} onViewer={setViewer} reload={reload} />;
  }

  const minimum = lot.minimumNextBidMinor ?? lot.startPriceMinor;
  const timeUp = now > 0 && msUntil(lot.endsAt, offsetMs, now) <= 0;

  // Time is up and the lot is waiting to be closed: there is nothing to bid on, and the clock above says why.
  if (timeUp) return <LotStanding standing={standing} minimumMinor={lot.minimumNextBidMinor} />;

  return (
    <div className="grid gap-4">
      {letIn && standing === 'none' ? <RegistrationApproved alias={viewer?.registration?.alias ?? null} /> : null}

      {/* Programmatic focus lands here after a bid is accepted: the form that had it is replaced by this. */}
      <div ref={standingRef} tabIndex={-1} className="empty:hidden">
        <LotStanding standing={standing} minimumMinor={lot.minimumNextBidMinor} />
      </div>

      {!online ? (
        <p role="status" className="notice notice-error">
          {t('bid.offline')}
        </p>
      ) : null}

      {standing === 'leading' ? null : (
        <BidForm
          lot={lot}
          minimum={minimum}
          money={money}
          online={online}
          applyEvent={applyEvent}
          refresh={refresh}
          onPlaced={(alias) => {
            focusStanding.current = true;
            setViewer((current) => ({ eligible: true, leading: false, ...current, alias, participating: true }));
          }}
          onNotEligible={(why) => {
            setViewer((current) => ({
              alias: null,
              participating: false,
              leading: false,
              ...current,
              eligible: false,
              reason: { code: 'BIDDER_NOT_ELIGIBLE', why: why ?? 'NOT_REGISTERED', message: '' },
            }));
            // The refusal said why in a word; the read says the rest (the organiser's reason, an appeal).
            reload();
          }}
        />
      )}

      <Disclosure label={t('proxy.label')} className="mt-0">
        <ProxyForm
          lot={lot}
          floor={standing === 'leading' ? (lot.currentBidMinor ?? minimum) : minimum}
          myMax={myMax}
          money={money}
          online={online}
          applyEvent={applyEvent}
          onSet={(max) => {
            setMyMax(max);
            reload();
          }}
        />
      </Disclosure>
    </div>
  );
}

function failureText(
  t: ReturnType<typeof useTranslations<'auction'>>,
  money: (minor: number) => string,
  failure: BidFailure,
  fallbackMinimum: number,
): string {
  switch (failure.key) {
    case 'bidTooLow':
      return t('errors.bidTooLow', { minimum: money(failure.minimumNextBidMinor ?? fallbackMinimum) });
    case 'proxyTooLow':
      return t('errors.proxyTooLow', { minimum: money(failure.minimumMaxMinor ?? fallbackMinimum) });
    case 'rateLimited':
      return failure.retryAfterSeconds === undefined ? t('errors.rateLimitedNow') : t('errors.rateLimited', { seconds: failure.retryAfterSeconds });
    default:
      return t(`errors.${failure.key}`);
  }
}

function BidForm({
  lot,
  minimum,
  money,
  online,
  applyEvent,
  refresh,
  onPlaced,
  onNotEligible,
}: {
  lot: PublicLot;
  minimum: number;
  money: (minor: number) => string;
  online: boolean;
  applyEvent: (event: LotLiveEvent, options?: { clock?: boolean }) => void;
  refresh: () => Promise<void>;
  onPlaced: (alias: string) => void;
  onNotEligible: (why: IneligibleWhy | undefined) => void;
}) {
  const t = useTranslations('auction');
  const [text, setText] = useState(amountForInput(minimum));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<BidFailure | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** The key of a bid that was sent and not answered, so pressing the button again for the same amount repeats it instead of making a second. */
  const pending = useRef<{ amountMinor: number; key: string } | null>(null);

  // Until the person types, the box follows the lowest bid as it moves.
  useEffect(() => {
    if (!dirty) setText(amountForInput(minimum));
  }, [minimum, dirty]);

  const amount = parseAmountToMinor(text);
  const problem = amount === null ? t('bid.invalid', { example: amountForInput(minimum) }) : amount < minimum ? t('bid.belowMinimum', { minimum: money(minimum) }) : null;
  const blocked = problem !== null || !online;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (amount === null || blocked || busy) return;
    setBusy(true);
    setFailure(null);
    setNote(null);
    const attempt = pending.current?.amountMinor === amount ? pending.current : (pending.current = { amountMinor: amount, key: newRequestKey() });
    try {
      const result = await placeBid(lot.lotId, amount, attempt.key);
      pending.current = null;
      applyEvent(eventFromAccepted(result), { clock: false });
      onPlaced(result.bid.alias);
      if (result.autoBid) setNote(t('bid.autoOutbid'));
      setDirty(false);
    } catch (error) {
      const failed = describeBidFailure(error);
      if (failed.newKey) pending.current = null;
      if (failed.key === 'notEligible') onNotEligible(failed.why);
      setFailure(failed);
      if (failed.refresh) void refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <Field label={t('bid.label')} hint={t('bid.hint', { minimum: money(minimum) })} error={dirty ? problem : null}>
        {(control) => (
          <input
            {...control}
            className="field-input field-xl w-full tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setDirty(true);
              setFailure(null);
              setNote(null);
            }}
          />
        )}
      </Field>

      <Button type="submit" loading={busy} loadingLabel={t('bid.placing')} disabled={blocked} className="w-full">
        {t('bid.submit', { amount: money(amount ?? minimum) })}
      </Button>

      {failure ? (
        <div role="alert" className="notice notice-error grid gap-2">
          <p>{failureText(t, money, failure, minimum)}</p>
          {failure.key === 'signedOut' ? (
            <Link href={`${ROUTES.storefront.login}?next=${encodeURIComponent(ROUTES.storefront.auctionLot(lot.lotId))}`} className="inline-flex min-h-touch items-center font-medium underline fold:min-h-0">
              {t('signIn.action')}
            </Link>
          ) : null}
        </div>
      ) : null}
      {note ? (
        <p role="status" className="notice notice-info">
          {note}
        </p>
      ) : null}
    </form>
  );
}

function ProxyForm({
  lot,
  floor,
  myMax,
  money,
  online,
  applyEvent,
  onSet,
}: {
  lot: PublicLot;
  floor: number;
  myMax: number | null;
  money: (minor: number) => string;
  online: boolean;
  applyEvent: (event: LotLiveEvent, options?: { clock?: boolean }) => void;
  onSet: (max: number | null) => void;
}) {
  const t = useTranslations('auction');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<BidFailure | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const amount = parseAmountToMinor(text);
  const problem =
    text.trim() === ''
      ? null
      : amount === null
        ? t('proxy.invalid', { example: amountForInput(floor) })
        : myMax !== null && amount < myMax
          ? t('errors.proxyCannotLower')
          : amount < floor
            ? t('errors.proxyTooLow', { minimum: money(floor) })
            : null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (amount === null || problem || busy || !online) return;
    setBusy(true);
    setFailure(null);
    setSaved(null);
    try {
      const result = await setProxyBid(lot.lotId, amount);
      onSet(result.maxMinor);
      if (result.autoBid) applyEvent(eventFromAccepted({ bid: result.autoBid, autoBid: null, lot: result.lot }), { clock: false });
      setSaved(t('proxy.saved', { amount: money(result.maxMinor ?? amount) }));
      setText('');
    } catch (error) {
      setFailure(describeBidFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <p className="text-sm text-neutral-900/60">{t('proxy.explain')}</p>
      {myMax !== null ? <p className="text-sm font-medium text-neutral-900">{t('proxy.current', { amount: money(myMax) })}</p> : null}

      <Field label={t('proxy.field')} hint={t('proxy.hint', { minimum: money(floor) })} error={problem}>
        {(control) => (
          <input
            {...control}
            className="field-input w-full tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setFailure(null);
              setSaved(null);
            }}
          />
        )}
      </Field>

      <Button type="submit" variant="secondary" loading={busy} loadingLabel={t('proxy.setting')} disabled={amount === null || problem !== null || !online} className="w-full">
        {t('proxy.submit')}
      </Button>

      {failure ? (
        <p role="alert" className="notice notice-error">
          {failureText(t, money, failure, floor)}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="notice notice-success">
          {saved}
        </p>
      ) : null}
    </form>
  );
}
