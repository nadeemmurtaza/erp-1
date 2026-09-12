'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { formatMoney, ORDER_STATUSES, type Locale, type StitchingStage } from '@yaseen/shared';
import { Link } from '@/i18n/navigation';
import { StitchingTimeline, type TimelineEvent } from '@/components/storefront/stitching-timeline';
import { API_URL } from '@/lib/api';
import { getCustomerToken } from '@/lib/cart-client';
import { ROUTES } from '@/constants/routes';

interface OrderItem {
  id: string;
  nameEn: string;
  nameUr: string | null;
  variantLabel: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  stitchingFeeUnit: number;
  lineTotal: number;
  stitchingServiceName: string | null;
  garmentTypeKey: string | null;
  measurementSnapshot: { label: string; values: Record<string, number> } | null;
  optionsSnapshot: Array<{ groupLabelEn: string; groupLabelUr: string; labelEn: string; labelUr: string }> | null;
  /** Present once the garment is in the workshop. */
  stitchingJob: {
    number: string;
    stage: StitchingStage;
    dueAt: string | null;
    events: TimelineEvent[];
  } | null;
}

interface Order {
  number: string;
  status: string;
  placedAt: string;
  itemsSubtotal: number;
  stitchingSubtotal: number;
  shippingFee: number;
  codFee: number;
  grandTotal: number;
  guestName: string | null;
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    province: string;
  };
  items: OrderItem[];
  payments: Array<{
    id: string;
    provider: string;
    status: string;
    reference: string | null;
    meta: { accounts?: Array<{ bank: string; title: string; accountNumber: string; iban: string }> } | null;
  }>;
  shipments: Array<{ courier: string; trackingNumber: string | null; trackingUrl: string | null }>;
  statusEvents: Array<{ toStatus: string; createdAt: string; note: string | null }>;
}

/**
 * One order, for the customer.
 *
 * Reachable two ways: signed in, or as a guest who supplies the phone number
 * the order was placed with. Order numbers alone reveal nothing — that check is
 * enforced by the API, not here.
 */
export default function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = use(params);
  const t = useTranslations('order');
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const justPlaced = searchParams.get('placed') === '1';
  // Set by checkout/callback/[provider]/route.ts after a JazzCash/Easypaisa
  // return — 'success' | 'failed'. Not the source of truth (order.status and
  // order.payments already are); this is only which banner to show once.
  const paymentResult = searchParams.get('payment');

  const [order, setOrder] = useState<Order | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = getCustomerToken();

    if (token) {
      try {
        const response = await fetch(`${API_URL}/orders/${number}`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });
        if (response.ok) {
          setOrder(await response.json());
          setLoading(false);
          return;
        }
      } catch (err) {
        // Network error or CORS, fallback to guest track if we have a saved phone
        console.error('Failed to fetch order with token:', err);
      }
    }

    // A guest who just checked out has the phone number they typed remembered
    // for this tab, so their confirmation appears without being asked to prove
    // who they are. Anyone else falls through to the tracking form.
    const remembered = sessionStorage.getItem(`yaseen.order.${number}`);
    if (remembered) {
      try {
        const response = await fetch(`${API_URL}/orders/${number}/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: remembered }),
          credentials: 'include',
        });
        if (response.ok) {
          setOrder(await response.json());
        }
      } catch (err) {
        console.error('Failed to fetch order tracking:', err);
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
      const response = await fetch(`${API_URL}/orders/${number}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
        credentials: 'include',
      });

      if (response.ok) {
        setOrder(await response.json());
        // Remember it for this tab so a refresh does not ask again.
        sessionStorage.setItem(`yaseen.order.${number}`, phone);
      } else {
        const payload = await response.json().catch(() => undefined);
        setError((payload as { message?: string })?.message ?? t('trackFailed'));
      }
    } catch (err) {
      console.error('Failed to submit order tracking:', err);
      setError(t('trackFailed'));
    }
  }

  if (loading) {
    return <div className="container-page py-16 text-center text-sm text-neutral-900/50">…</div>;
  }

  if (!order) {
    return (
      <div className="container-page py-16">
        <div className="mx-auto max-w-md">
          <h1 className="text-2xl font-semibold text-neutral-900">{t('trackTitle')}</h1>
          <p className="mt-2 text-sm text-neutral-900/60">{t('trackBody', { number })}</p>

          <form onSubmit={trackWithPhone} className="card mt-6 space-y-4 p-4">
            <label className="block">
              <span className="field-label">{t('phone')}</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                inputMode="tel"
                placeholder="03001234567"
                className="field-input"
              />
            </label>

            {error ? (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button type="submit" className="btn-primary w-full">
              {t('track')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const bankAccounts =
    order.payments.find((payment) => payment.provider === 'bank_transfer')?.meta?.accounts ?? [];

  return (
    <div className="container-page py-8">
      {justPlaced ? (
        <div className="mb-6 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
          <p className="text-sm font-medium text-accent-hover">{t('thanks')}</p>
          <p className="mt-1 text-sm text-neutral-900/70">{t('thanksBody')}</p>
        </div>
      ) : null}

      {paymentResult === 'success' ? (
        <div className="mb-6 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
          <p className="text-sm font-medium text-accent-hover">{t('paymentSuccess')}</p>
          <p className="mt-1 text-sm text-neutral-900/70">{t('paymentSuccessBody')}</p>
        </div>
      ) : null}

      {paymentResult === 'failed' ? (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">{t('paymentFailed')}</p>
          <p className="mt-1 text-sm text-neutral-900/70">{t('paymentFailedBody')}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900">
          {t('title')} {order.number}
        </h1>
        <StatusPill status={order.status} />
      </div>

      <p className="mt-1 text-sm text-neutral-900/50">
        {t('placedOn', { date: new Date(order.placedAt).toLocaleDateString(locale === 'ur' ? 'ur-PK' : 'en-PK') })}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="card">
            <h2 className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900">
              {t('items')}
            </h2>
            <ul className="divide-y divide-white">
              {order.items.map((item) => (
                <li key={item.id} className="p-4">
                  <div className="flex justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">
                        {locale === 'ur' && item.nameUr ? item.nameUr : item.nameEn}
                      </p>
                      {item.variantLabel ? (
                        <p className="text-xs text-neutral-900/50">{item.variantLabel}</p>
                      ) : null}
                      <p className="text-xs text-neutral-900/50">× {item.quantity}</p>
                    </div>
                    <p className="shrink-0 text-sm font-medium text-neutral-900">
                      {formatMoney(item.lineTotal, locale)}
                    </p>
                  </div>

                  {item.stitchingServiceName ? (
                    <div className="mt-2 rounded-md bg-neutral-50 p-2.5 text-xs">
                      <p className="font-medium text-accent-hover">
                        {item.stitchingServiceName} ·{' '}
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
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold text-neutral-900">{t('progress')}</h2>
            <ol className="mt-3 space-y-3">
              {order.statusEvents.map((event, index) => (
                <li key={`${event.toStatus}-${index}`} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-hover" />
                  <span>
                    <span className="font-medium text-neutral-900">{t(`status.${event.toStatus}`)}</span>
                    <span className="ms-2 text-xs text-neutral-900/40">
                      {new Date(event.createdAt).toLocaleString(
                        locale === 'ur' ? 'ur-PK' : 'en-PK',
                      )}
                    </span>
                    {event.note ? (
                      <span className="block text-xs text-neutral-900/60">{event.note}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {order.shipments.length > 0 ? (
            <section className="card p-4">
              <h2 className="text-sm font-semibold text-neutral-900">{t('shipment')}</h2>
              {order.shipments.map((shipment, index) => (
                <p key={index} className="mt-2 text-sm text-neutral-900/70">
                  {shipment.courier.toUpperCase()}
                  {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}
                </p>
              ))}
            </section>
          ) : null}
        </div>

        <aside className="space-y-6">
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-neutral-900">{t('summary')}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label={t('goods')} value={formatMoney(order.itemsSubtotal, locale)} />
              {order.stitchingSubtotal > 0 ? (
                <Row
                  label={t('stitching')}
                  value={formatMoney(order.stitchingSubtotal, locale)}
                />
              ) : null}
              <Row
                label={t('shipping')}
                value={
                  order.shippingFee === 0 ? t('freeShipping') : formatMoney(order.shippingFee, locale)
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
          </section>

          {bankAccounts.length > 0 ? (
            <section className="card p-4">
              <h2 className="text-sm font-semibold text-neutral-900">{t('bankTransfer')}</h2>
              <p className="mt-1 text-xs text-neutral-900/60">{t('bankTransferBody')}</p>
              {bankAccounts.map((account) => (
                <dl key={account.iban} className="mt-3 space-y-1 text-xs">
                  <Row label={account.bank} value={account.title} />
                  <Row label={t('accountNumber')} value={account.accountNumber} />
                  <Row label="IBAN" value={account.iban} />
                </dl>
              ))}
            </section>
          ) : null}

          <section className="card p-4">
            <h2 className="text-sm font-semibold text-neutral-900">{t('deliveringTo')}</h2>
            <address className="mt-2 text-sm not-italic text-neutral-900/70">
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
          </section>

          <Link href={ROUTES.storefront.shop} className="btn-secondary w-full">
            {t('continueShopping')}
          </Link>
        </aside>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const t = useTranslations('order');
  const known = (ORDER_STATUSES as readonly string[]).includes(status);

  return (
    <span
      className={cn(
        'rounded px-3 py-1 text-xs font-medium',
        status === 'DELIVERED' && 'bg-neutral-100 text-accent-hover',
        status === 'CANCELLED' && 'bg-red-50 text-red-700',
        status === 'PENDING' && 'bg-neutral-100 text-neutral-900/70',
        !['DELIVERED', 'CANCELLED', 'PENDING'].includes(status) && 'bg-neutral-50 text-accent-hover',
      )}
    >
      {known ? t(`status.${status}`) : status}
    </span>
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
