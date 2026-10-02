'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { formatDate, formatDateTime, formatMoney, type Locale } from '@newax/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { StitchingTimeline } from '@/components/storefront/stitching-timeline';
import { customerFetch, getCustomerToken, getMyOrder, trackOrder } from '@/lib/customer-client';
import { StatusBadge } from '@/components/common/status-badge';
import { useOrderStatusLabel } from '@/hooks/use-order-status-label';
import { Disclosure, Loading, PageHeader, ScrambleText, Section, SuccessState } from '@/components/ui';
import type { CustomerOrder } from '@/types/api';
import { ROUTES } from '@/constants/routes';
import { STORAGE_KEYS } from '@/constants/storage';
import { journeyStates } from '@/lib/success-state';

/**
 * The one open loop on a placed order (SUC-4): the steps its status moves through, which the API records in
 * `statusEvents` and the page already shows. A status maps to the last step it has reached; the cancelled and
 * returned ones are not on this road, so they get no loop.
 */
const ORDER_JOURNEY = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED'] as const;
const ORDER_REACHED: Record<string, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  PROCESSING: 1,
  READY_TO_SHIP: 1,
  SHIPPED: 2,
  DELIVERED: 3,
};

/**
 * One order, for the customer.
 *
 * Reachable two ways: signed in, or as a guest who supplies the phone number
 * the order was placed with. Order numbers alone reveal nothing — that check
 * is enforced by the API, not here. The layout above lets signed-out visitors
 * through to this route for exactly that reason; see PUBLIC_ROUTES there.
 *
 * Laid out as an object, not a dashboard. What the order *is* comes first —
 * number, status, when it was placed. Then anything waiting on the reader:
 * bank details they still have to pay into sit above the goods, because a
 * customer who owes money needs that before a line-item breakdown. Then the
 * substance, then the history behind a disclosure, because "what happened to
 * this order" is a question asked after something looks wrong, not on arrival.
 *
 * Seven boxes became four headed regions. Nothing was removed.
 */
export default function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = use(params);
  const t = useTranslations('order');
  const tReturns = useTranslations('returns');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const statusLabel = useOrderStatusLabel();
  const router = useRouter();
  const searchParams = useSearchParams();
  const justPlaced = searchParams.get('placed') === '1';
  // Set by checkout/callback/[provider]/route.ts after a JazzCash/Easypaisa
  // return — 'success' | 'failed'. Not the source of truth (order.status and
  // order.payments already are); this is only which banner to show once.
  const paymentResult = searchParams.get('payment');

  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);
  const [reorderMessage, setReorderMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (getCustomerToken()) {
      try {
        setOrder(await getMyOrder(number));
        setLoading(false);
        return;
      } catch {
        // Expired session, or an order belonging to someone else. Either way
        // the guest path below is still worth trying.
      }
    }

    // A guest who just checked out has the phone number they typed remembered
    // for this tab, so their confirmation appears without being asked to prove
    // who they are. Anyone else falls through to the tracking form.
    const remembered = sessionStorage.getItem(STORAGE_KEYS.guestOrder(number));
    if (remembered) {
      try {
        setOrder(await trackOrder(number, remembered));
      } catch {
        // The remembered number no longer matches — fall through to the form.
      }
    }

    setLoading(false);
  }, [number]);

  useEffect(() => {
    void load();
  }, [load]);

  async function trackWithPhone(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      setOrder(await trackOrder(number, phone));
      // Remember it for this tab so a refresh does not ask again.
      sessionStorage.setItem(STORAGE_KEYS.guestOrder(number), phone);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('trackFailed'));
    }
  }

  async function reorder() {
    setReordering(true);
    setReorderMessage(null);
    try {
      const result = await customerFetch<{ addedCount: number; unavailable: string[] }>(
        `/cart/reorder/${number}`,
        { method: 'POST' },
      );
      if (result.unavailable.length > 0) {
        setReorderMessage(t('reorderPartial', { names: result.unavailable.join(', ') }));
      } else {
        router.push(ROUTES.storefront.cart);
      }
    } catch {
      setReorderMessage(t('reorderFailed'));
    } finally {
      setReordering(false);
    }
  }

  if (loading) {
    return <Loading />;
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-md">
        <PageHeader title={t('trackTitle')} description={t('trackBody', { number })} />

        <form onSubmit={trackWithPhone} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="trackPhone">
              {t('phone')}
            </label>
            <input
              id="trackPhone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
              inputMode="tel"
              autoComplete="tel"
              placeholder="03001234567"
              className="field-input"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary w-full">
            {t('track')}
          </button>
        </form>
      </div>
    );
  }

  const bankPayment = order.payments.find((payment) => payment.provider === 'bank_transfer');
  const bankAccounts = bankPayment?.meta?.accounts ?? [];

  // An order was just placed, or money just reached it (SUC-3): the result is the page until the reader goes on to
  // the order. A cancelled or returned order is not good news, so it shows the order itself.
  const reached = ORDER_REACHED[order.status];
  if ((justPlaced || paymentResult === 'success') && reached !== undefined) {
    const paid = paymentResult === 'success';
    // "Not paid yet" only while the transfer is actually outstanding: a reload after it was confirmed must not say so.
    const owesTransfer = !paid && bankAccounts.length > 0 && bankPayment?.status !== 'PAID';
    const states = journeyStates(ORDER_JOURNEY.length, reached);

    return (
      <div className="flex justify-center py-12">
        <SuccessState
          as="h1"
          focus
          linkAs={Link}
          title={t.rich(paid ? 'successPaidTitle' : 'successPlacedTitle', {
            number: () => <ScrambleText text={order.number} />,
          })}
          detail={
            <>
              <span className="block">
                {formatMoney(order.grandTotal, locale)} · {t('placedOn', { date: formatDate(order.placedAt, locale) })}
              </span>
              <span className="mt-1 block">
                {paid ? t('paymentSuccessBody') : owesTransfer ? t('successBankDetail') : t('thanksBody')}
              </span>
            </>
          }
          primary={{
            label: owesTransfer ? t('successViewBank') : t('successView'),
            href: ROUTES.storefront.order(order.number),
          }}
          secondary={{ label: t('continueShopping'), href: ROUTES.storefront.shop }}
          loop={{
            steps: ORDER_JOURNEY.map((status, index) => ({ label: statusLabel(status), state: states[index]! })),
            labels: {
              done: tCommon('journey.done'),
              current: tCommon('journey.current'),
              next: tCommon('journey.next'),
            },
          }}
        />
      </div>
    );
  }

  return (
    <>
      {paymentResult === 'failed' ? (
        <Notice title={t('paymentFailed')} body={t('paymentFailedBody')} tone="danger" />
      ) : null}

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {t('title')} {order.number}
            <StatusBadge status={order.status} label={statusLabel(order.status)} />
          </span>
        }
        description={t('placedOn', {
          date: formatDate(order.placedAt, locale),
        })}
        action={
          <div className="flex flex-wrap gap-2">
            {getCustomerToken() ? (
              <button type="button" onClick={reorder} disabled={reordering} className="btn-secondary">
                {reordering ? t('reordering') : t('reorder')}
              </button>
            ) : null}
            {getCustomerToken() ? (
              <Link href={ROUTES.storefront.orderInvoice(order.number)} className="btn-secondary">
                {t('downloadInvoice')}
              </Link>
            ) : null}
            <Link href={ROUTES.storefront.shop} className="btn-secondary">
              {t('continueShopping')}
            </Link>
          </div>
        }
      />

      {reorderMessage ? (
        <p role="alert" className="mb-4 text-sm text-neutral-900/70">
          {reorderMessage}
        </p>
      ) : null}

      {order.status === 'DELIVERED' ? (
        <p className="mb-6">
          <Link href={ROUTES.storefront.accountReturnNew(order.number)} className="btn-text">
            {tReturns('requestAction')}
          </Link>
        </p>
      ) : null}

      {bankAccounts.length > 0 ? (
        <Section title={t('bankTransfer')} description={t('bankTransferBody')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
            {bankAccounts.map((account) => (
              <dl key={account.iban} className="card space-y-1 p-4 text-sm">
                <Row label={account.bank} value={account.title} />
                <Row label={t('accountNumber')} value={account.accountNumber} />
                <Row label="IBAN" value={account.iban} />
              </dl>
            ))}
          </div>
        </Section>
      ) : null}

      <div className="grid gap-x-10 lg:grid-cols-[1fr_20rem]">
        <Section title={t('items')}>
          <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
            {order.items.map((item) => (
              <li key={item.id} className="py-4">
                <div className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900">
                      {locale === 'ur' && item.nameUr ? item.nameUr : item.nameEn}
                    </p>
                    {item.variantLabel ? (
                      <p className="text-xs text-neutral-900/60">{item.variantLabel}</p>
                    ) : null}
                    <p className="text-xs text-neutral-900/60">&times; {item.quantity}</p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-neutral-900">
                    {formatMoney(item.lineTotal, locale)}
                  </p>
                </div>

                {item.stitchingServiceName ? (
                  <div className="mt-2 bg-neutral-50 p-2.5 text-xs">
                    <p className="font-medium text-accent-hover">
                      {item.stitchingServiceName} &middot;{' '}
                      {formatMoney(item.stitchingFeeUnit, locale)}
                    </p>
                    {item.optionsSnapshot?.length ? (
                      <p className="mt-1 text-neutral-900/70">
                        {item.optionsSnapshot
                          .map(
                            (option) =>
                              `${locale === 'ur' ? option.groupLabelUr : option.groupLabelEn}: ${
                                locale === 'ur' ? option.labelUr : option.labelEn
                              }`,
                          )
                          .join(' · ')}
                      </p>
                    ) : null}
                    {item.measurementSnapshot ? (
                      <p className="mt-1 text-neutral-900/70">
                        {t('measurements')}: {item.measurementSnapshot.label}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {item.stitchingJob ? (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-medium text-neutral-900/60">
                      {item.stitchingJob.number}
                    </p>
                    <StitchingTimeline
                      stage={item.stitchingJob.stage}
                      events={item.stitchingJob.events}
                      dueAt={item.stitchingJob.dueAt}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>

        <div>
          <Section title={t('summary')}>
            <dl className="space-y-2 text-sm">
              <Row label={t('goods')} value={formatMoney(order.itemsSubtotal, locale)} />
              {order.stitchingSubtotal > 0 ? (
                <Row label={t('stitching')} value={formatMoney(order.stitchingSubtotal, locale)} />
              ) : null}
              <Row
                label={t('shipping')}
                value={
                  order.shippingFee === 0
                    ? t('freeShipping')
                    : formatMoney(order.shippingFee, locale)
                }
              />
              {order.codFee > 0 ? (
                <Row label={t('codFee')} value={formatMoney(order.codFee, locale)} />
              ) : null}
            </dl>
            <div className="mt-3 flex justify-between border-t border-neutral-100 pt-3">
              <span className="text-sm font-medium text-neutral-900">{t('total')}</span>
              <span className="text-lg font-semibold text-neutral-900">
                {formatMoney(order.grandTotal, locale)}
              </span>
            </div>
          </Section>

          <Section title={t('deliveringTo')}>
            <address className="text-sm not-italic text-neutral-900/70">
              {order.shippingAddress.fullName}
              <br />
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 ? (
                <>
                  <br />
                  {order.shippingAddress.line2}
                </>
              ) : null}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.province}
              <br />
              {order.shippingAddress.phone}
            </address>

            {order.shipments.length > 0 ? (
              <p className="mt-3 text-sm text-neutral-900/70">
                {order.shipments
                  .map((shipment) =>
                    [shipment.courier.toUpperCase(), shipment.trackingNumber]
                      .filter(Boolean)
                      .join(' · '),
                  )
                  .join(', ')}
              </p>
            ) : null}
          </Section>
        </div>
      </div>

      <Disclosure label={`${t('progress')} (${order.statusEvents.length})`}>
        <ol className="space-y-3">
          {order.statusEvents.map((event, index) => (
            <li key={`${event.toStatus}-${index}`} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-hover" />
              <span>
                <span className="font-medium text-neutral-900">{statusLabel(event.toStatus)}</span>
                <span className="ms-2 text-xs text-neutral-900/60">
                  {formatDateTime(event.createdAt, locale)}
                </span>
                {event.note ? (
                  <span className="block text-xs text-neutral-900/60">{event.note}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </Disclosure>
    </>
  );
}

/**
 * A one-off message about a payment that did not go through. Placed and paid are
 * the page's own success state now (`SuccessState`, above); this stays as the
 * red one, which has to ask the reader to act and so is not good news.
 */
function Notice({ title, body, tone }: { title: string; body: string; tone?: 'danger' }) {
  const danger = tone === 'danger';

  return (
    <div
      role={danger ? 'alert' : 'status'}
      className={
        danger
          ? 'mb-6 animate-arrive border border-red-200 bg-red-50 px-4 py-3'
          : 'mb-6 animate-arrive border border-neutral-100 bg-neutral-50 px-4 py-3'
      }
    >
      <p
        className={
          danger ? 'text-sm font-medium text-red-800' : 'text-sm font-medium text-accent-hover'
        }
      >
        {title}
      </p>
      <p className="mt-1 text-sm text-neutral-900/70">{body}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-900/60">{label}</dt>
      <dd className="text-end text-neutral-900">{value}</dd>
    </div>
  );
}
