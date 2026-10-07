'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime, formatMoney, formatNumber, type Locale } from '@newax/shared';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import type { PublicLot } from '@/lib/auction-live';
import { premiumPercent, type SettlementCard } from '@/lib/auction-settlement';

/**
 * What a winner owes and where to pay it (launchpad-apps/234-auction-app.md §9,
 * §11, WO-234.6). The card takes the bid box's place in the lot page once the lot
 * has closed in the viewer's favour, and tells one thing: that the invoice is
 * being made, that it is late, what to pay and by when, that it is paid, or how
 * the win ended. Paying happens on the order, which already knows how: this card
 * is the way to it, not a second place to pay.
 *
 * The title is the card's one live region, as the registration card's is: a
 * change of state is announced by its words changing.
 */
export function LotSettlement({ card }: { card: SettlementCard }) {
  const t = useTranslations('auction.settlement');
  const locale = useLocale() as Locale;
  const money = (minor: number) => formatMoney(minor, locale);

  const title = (text: string) => (
    <p role="status" className="text-base font-medium text-neutral-900">
      {text}
    </p>
  );
  const body = (text: string) => <p className="max-w-[70ch] text-sm text-neutral-900/60">{text}</p>;
  const orderLink = (orderNumber: string | null, label: string, primary: boolean) =>
    orderNumber ? (
      <Link href={ROUTES.storefront.order(orderNumber)} className={`${primary ? 'btn-primary' : 'btn-secondary'} w-full fold:w-auto fold:justify-self-start`}>
        {label}
      </Link>
    ) : null;

  switch (card.kind) {
    case 'preparing':
      return (
        <div className="grid gap-3">
          {title(t('preparing.title'))}
          {body(t('preparing.body'))}
        </div>
      );

    case 'delayed':
      return (
        <div className="grid gap-3">
          {title(t('delayed.title'))}
          {body(t('delayed.body'))}
        </div>
      );

    case 'pay':
      return (
        <div className="grid gap-3">
          {title(card.offered ? t('pay.offeredTitle') : t('pay.title'))}
          {card.offered ? body(t('pay.offeredBody')) : null}
          <dl className="grid gap-2 text-sm">
            <Row label={t('pay.winningBid')} value={money(card.hammerMinor)} />
            {card.premiumMinor > 0 ? <Row label={t('pay.premium')} value={money(card.premiumMinor)} /> : null}
            <Row label={t('pay.total')} value={money(card.totalMinor)} strong />
            {card.leftMinor !== null ? <Row label={t('pay.left')} value={money(card.leftMinor)} strong /> : null}
          </dl>
          <p className="text-sm text-neutral-900">{t('pay.dueBy', { date: formatDateTime(card.dueAt, locale) })}</p>
          {orderLink(card.orderNumber, t('pay.action'), true)}
        </div>
      );

    case 'paid':
      return (
        <div className="grid gap-3">
          {title(t('paid.title'))}
          {body(t('paid.body', { amount: money(card.totalMinor) }))}
          {orderLink(card.orderNumber, t('paid.action'), false)}
        </div>
      );

    case 'lapsed':
      return (
        <div className="grid gap-3">
          {title(t('lapsed.title'))}
          {body(t('lapsed.body', { date: formatDateTime(card.dueAt, locale) }))}
          {card.paidMinor > 0 ? (
            <>
              <p role="status" className="notice notice-warning">
                {t('lapsed.paid', { amount: money(card.paidMinor) })}
              </p>
              <Link href={ROUTES.storefront.contact} className="btn-secondary w-full fold:w-auto fold:justify-self-start">
                {t('lapsed.action')}
              </Link>
            </>
          ) : null}
        </div>
      );

    case 'cancelled':
      return (
        <div className="grid gap-3">
          {title(t('cancelled.title'))}
          {body(t('cancelled.body'))}
        </div>
      );
  }
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? 'border-t border-neutral-100 pt-2 font-medium text-neutral-900' : 'text-neutral-900/70'}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * The one line that says what winning costs, before anyone bids: the buyer's
 * premium on top of the winning bid, if the sale has one, and how long the
 * winner has to pay. Both were frozen when the sale was scheduled, so what is
 * said here is what will be charged. Nothing on a lot that has closed.
 */
export function LotCosts({ lot }: { lot: PublicLot }) {
  const t = useTranslations('auction.settlement.costs');
  const locale = useLocale() as Locale;
  if (lot.phase === 'CLOSED') return null;

  const { buyerPremiumBps, paymentWindowHours } = lot.auction;
  return (
    <p className="text-sm text-neutral-900/60">
      {buyerPremiumBps > 0
        ? t('withPremium', { percent: formatNumber(premiumPercent(buyerPremiumBps), locale), hours: paymentWindowHours })
        : t('noPremium', { hours: paymentWindowHours })}
    </p>
  );
}
