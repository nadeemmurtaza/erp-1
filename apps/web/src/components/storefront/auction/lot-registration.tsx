'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime, type Locale } from '@newax/shared';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { Button, Field } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import type { LotViewer } from '@/hooks/use-lot-viewer';
import { joinAuction, sendAppeal } from '@/lib/auction-client';
import { MAX_APPEAL_LENGTH, type PublicLot, type RegistrationMode, type ViewerLotState } from '@/lib/auction-live';
import {
  REGISTRATION_POLL_MS,
  describeRegistrationFailure,
  registrationCard,
  withRegistration,
  type RegistrationCard,
  type RegistrationFailure,
} from '@/lib/auction-registration';

/** The card's identity for focus: a change of it, not of its text, is a change of state the person should be told about. */
function cardKey(card: RegistrationCard): string {
  return card.kind === 'declined' || card.kind === 'suspended' ? `${card.kind}:${card.appeal}` : card.kind;
}

/** Where focus belongs after the card changes: anywhere the person put it is theirs, but "nowhere" (the button they pressed is gone) is not. */
function focusIsFree(root: HTMLElement | null): boolean {
  const active = document.activeElement;
  return !active || active === document.body || (root !== null && root.contains(active));
}

/**
 * What a signed-in person who may not bid sees in the bid box's place
 * (launchpad-apps/234-auction-app.md §8, §11, WO-234.5): one card for their place
 * in this auction, whichever lot they are on. Joining, waiting for the
 * organiser, a decline or suspension with its reason and one appeal, or being
 * the staff who run it. One headline, one line, one loud button; nothing else.
 *
 * It tells the person in their language from codes (`registrationCard`), shows
 * the organiser's own reason as written, and keeps what they typed when a send
 * fails. When the state changes under them (the organiser decided, another tab
 * acted) focus moves to the new title, unless they were doing something
 * elsewhere on the page.
 */
export function LotRegistration({
  card,
  lot,
  mode,
  onViewer,
  reload,
}: {
  card: RegistrationCard;
  lot: PublicLot;
  mode: RegistrationMode;
  onViewer: Dispatch<SetStateAction<ViewerLotState | null>>;
  reload: () => void;
}) {
  const t = useTranslations('auction.registration');
  const locale = useLocale() as Locale;
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<'join' | 'appeal' | null>(null);
  const [failure, setFailure] = useState<RegistrationFailure | null>(null);
  /** What the person has typed, kept across a failed send so a bad connection never costs them their words. */
  const [draft, setDraft] = useState('');

  const key = cardKey(card);
  const shownKey = useRef(key);
  useEffect(() => {
    if (shownKey.current === key) return;
    shownKey.current = key;
    if (focusIsFree(rootRef.current)) titleRef.current?.focus();
  }, [key]);

  // The card that replaces itself with "this auction has ended" had its button taken away from under focus: the sentence takes it. Any other failure is an alert, which takes it.
  useEffect(() => {
    if (!failure) return;
    (failure.key === 'ended' || failure.key === 'unavailable' ? titleRef : alertRef).current?.focus();
  }, [failure]);

  const seconds = REGISTRATION_POLL_MS / 1_000;
  const poll = { seconds };

  async function act(kind: 'join' | 'appeal', send: () => ReturnType<typeof joinAuction>) {
    if (busy) return;
    setBusy(kind);
    setFailure(null);
    try {
      const registration = await send();
      onViewer((current) => withRegistration(current, registration));
      if (kind === 'appeal') setDraft('');
      reload();
    } catch (error) {
      const failed = describeRegistrationFailure(error);
      setFailure(failed);
      if (failed.refresh) reload();
    } finally {
      setBusy(null);
    }
  }

  // The title is the card's one live region: a change of state (the organiser decided, the page noticed) is announced by its words changing, and the appeal's character count, which changes on every key, is deliberately outside it.
  const title = (text: string) => (
    <p ref={titleRef} tabIndex={-1} role="status" className="text-base font-medium text-neutral-900">
      {text}
    </p>
  );
  const others = (className: string) => (
    <Link href={ROUTES.storefront.auctions} className={`btn-secondary w-full fold:w-auto fold:justify-self-start ${className}`}>
      {t('action.others')}
    </Link>
  );
  /** The organiser's words, as written: either script, any length, never cut. */
  const reasonBlock = (reason: string | null) =>
    reason ? (
      <div className="grid gap-1">
        <p className="text-xs text-neutral-900/60">{t('declined.reasonLabel')}</p>
        <p dir="auto" className="whitespace-pre-line break-words text-sm text-neutral-900">
          {reason}
        </p>
      </div>
    ) : null;

  let content: React.ReactNode;
  if (failure?.key === 'ended' || failure?.key === 'unavailable') {
    // The auction is over, or is not taking bidders: the card is that fact and a way on, not a button that cannot work.
    content = (
      <>
        {title(t(`error.${failure.key}`))}
        {others('')}
      </>
    );
  } else if (card.kind === 'join') {
    content = (
      <>
        {title(t('join.title'))}
        <p className="max-w-[70ch] text-sm text-neutral-900/60">{t(`join.body.${mode}`)}</p>
        <Button
          loading={busy === 'join'}
          loadingLabel={t('join.joining')}
          onClick={() => void act('join', () => joinAuction(lot.auction.id))}
          className="w-full fold:w-auto fold:justify-self-start"
        >
          {t('join.action')}
        </Button>
      </>
    );
  } else if (card.kind === 'pending') {
    content = (
      <>
        {title(t('pending.title'))}
        <p className="max-w-[70ch] text-sm text-neutral-900/60">{t('pending.body', poll)}</p>
        {card.joinedAt ? <p className="text-xs text-neutral-900/60">{t('pending.since', { date: formatDateTime(card.joinedAt, locale) })}</p> : null}
        {others('')}
      </>
    );
  } else if (card.kind === 'runs') {
    content = (
      <>
        {title(t('staff.title'))}
        <p className="max-w-[70ch] text-sm text-neutral-900/60">{t('staff.body')}</p>
        {others('')}
      </>
    );
  } else if (card.appeal === 'sent') {
    content = (
      <>
        {title(t('appealSent.title'))}
        <p className="max-w-[70ch] text-sm text-neutral-900/60">{t('appealSent.body', poll)}</p>
        {card.appealText ? (
          <div className="grid gap-1">
            <p className="text-xs text-neutral-900/60">{t('appealSent.yours')}</p>
            <p dir="auto" className="whitespace-pre-line break-words text-sm text-neutral-900">
              {card.appealText}
            </p>
          </div>
        ) : null}
        {others('')}
      </>
    );
  } else if (card.appeal === 'kept') {
    content = (
      <>
        {title(t('kept.title'))}
        <p className="max-w-[70ch] text-sm text-neutral-900/60">{t('kept.body')}</p>
        {reasonBlock(card.reason)}
        <Link href={ROUTES.storefront.contact} className="btn-secondary w-full fold:w-auto fold:justify-self-start">
          {t('kept.action')}
        </Link>
      </>
    );
  } else {
    const text = draft.trim();
    content = (
      <>
        {title(card.kind === 'declined' ? t('declined.title') : t('suspended.title'))}
        {card.kind === 'suspended' ? <p className="max-w-[70ch] text-sm text-neutral-900/60">{t('suspended.body')}</p> : null}
        {reasonBlock(card.reason)}
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (text) void act('appeal', () => sendAppeal(lot.auction.id, text));
          }}
        >
          <Field label={t('appeal.label')} hint={t('appeal.hint', { max: MAX_APPEAL_LENGTH })}>
            {(control) => (
              <textarea
                {...control}
                className="field-input w-full"
                rows={4}
                maxLength={MAX_APPEAL_LENGTH}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setFailure(null);
                }}
              />
            )}
          </Field>
          <p className="text-end text-xs tabular-nums text-neutral-900/60">{t('appeal.count', { count: draft.length, max: MAX_APPEAL_LENGTH })}</p>
          <Button
            type="submit"
            loading={busy === 'appeal'}
            loadingLabel={t('appeal.sending')}
            disabled={text === ''}
            className="w-full fold:w-auto fold:justify-self-start"
          >
            {t('appeal.send')}
          </Button>
        </form>
        {others('')}
      </>
    );
  }

  return (
    <div ref={rootRef} className="grid gap-3">
      {content}
      {failure && failure.key !== 'ended' && failure.key !== 'unavailable' ? (
        <div ref={alertRef} tabIndex={-1} role="alert" className="notice notice-error ignite grid gap-2">
          <p>{t(`error.${failure.key}`, { seconds: failure.retryAfterSeconds ?? 0 })}</p>
          {failure.key === 'signedOut' ? (
            <Link
              href={`${ROUTES.storefront.login}?next=${encodeURIComponent(ROUTES.storefront.auctionLot(lot.lotId))}`}
              className="inline-flex min-h-touch items-center font-medium underline fold:min-h-0"
            >
              {t('error.signedOutAction')}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The line a person sees above the bid box when the organiser has just let them
 * in (their join was approved at once, or the page noticed the approval while
 * they waited). A status, not a card: the bid box below it is the next thing
 * they do. Focus lands here when nothing else has it, so a keyboard user is told.
 */
export function RegistrationApproved({ alias, takeFocus = true }: { alias: string | null; takeFocus?: boolean }) {
  const t = useTranslations('auction.registration');
  const ref = useRef<HTMLDivElement>(null);
  // Only when the person was just let in; for one who arrives already approved it is a fact on the page, not news, so it must not pull focus on load.
  useEffect(() => {
    if (takeFocus && (!document.activeElement || document.activeElement === document.body)) ref.current?.focus();
  }, [takeFocus]);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="notice notice-success grid gap-1">
      <p className="font-medium">{t('approved.title')}</p>
      {alias ? <p>{t('approved.body', { alias })}</p> : null}
    </div>
  );
}

/**
 * Whether the organiser's yes arrived while the person was on this page: they
 * joined and were let in at once, or the page noticed the approval while they
 * waited. Read from the change of status, so someone who arrives already
 * approved, or whose first bid registered them, is not congratulated.
 */
export function useLetIn(viewer: ViewerLotState | null): boolean {
  const status = viewer?.registration?.status;
  const last = useRef(status);
  const [letIn, setLetIn] = useState(false);
  useEffect(() => {
    const before = last.current;
    last.current = status;
    if (status === 'APPROVED' && before !== undefined && before !== 'APPROVED') setLetIn(true);
  }, [status]);
  return letIn;
}

/**
 * Joining before bidding opens. An auction that approves its bidders can be
 * joined as soon as it is scheduled, so the organiser can decide ahead of the
 * start; an upcoming lot has no bid box, so this is the only thing a signed-in
 * person who has not been let in sees there, and nothing for someone who has.
 */
export function LotJoin({ lot, lotViewer }: { lot: PublicLot; lotViewer: LotViewer }) {
  const { user } = useCustomerSession();
  const { viewer, setViewer, reload } = lotViewer;
  const letIn = useLetIn(viewer);
  const card = user ? registrationCard(viewer) : null;
  if (card) return <LotRegistration card={card} lot={lot} mode={viewer?.registration?.mode ?? 'APPROVAL'} onViewer={setViewer} reload={reload} />;
  // An upcoming lot has no bid box to show that they may bid, so a person approved yesterday is told so on every visit, not only in the session they were let in.
  if (user && viewer?.registration?.status === 'APPROVED') return <RegistrationApproved alias={viewer.registration.alias ?? null} takeFocus={letIn} />;
  return null;
}
