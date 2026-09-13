'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { formatDate, formatMoney, type Locale, type StitchingStage } from '@newax/shared';
import { Link } from '@/i18n/navigation';
import { StitchingTimeline, type TimelineEvent } from '@/components/storefront/stitching-timeline';
import { API_URL } from '@/lib/api';
import { ROUTES } from '@/constants/routes';
import { STORAGE_KEYS } from '@/constants/storage';

interface BookingJob {
  id: string;
  number: string;
  stage: StitchingStage;
  dueAt: string | null;
  instructions: string | null;
  garmentType: { labelEn: string; labelUr: string };
  events: TimelineEvent[];
}

interface Booking {
  number: string;
  status: string;
  guestName: string | null;
  fabricNotes: string | null;
  fabricReceivedAt: string | null;
  promisedAt: string | null;
  quotedFee: number | null;
  jobs: BookingJob[];
}

/**
 * A stitching booking, for the customer.
 *
 * Same guard as an order: the booking number alone proves nothing, so anyone
 * without the phone number it was made with is asked for it. Someone who has
 * just booked has it remembered for the tab.
 */
export default function StitchingBookingPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = use(params);
  const t = useTranslations('stitching');
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const justBooked = searchParams.get('booked') === '1';

  const [booking, setBooking] = useState<Booking | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const track = useCallback(
    async (withPhone: string): Promise<boolean> => {
      const response = await fetch(`${API_URL}/stitching/bookings/${number}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: withPhone }),
        credentials: 'include',
      });

      if (!response.ok) return false;
      setBooking(await response.json());
      return true;
    },
    [number],
  );

  useEffect(() => {
    const remembered = sessionStorage.getItem(STORAGE_KEYS.guestBooking(number));
    if (!remembered) {
      setLoading(false);
      return;
    }

    void track(remembered).finally(() => setLoading(false));
  }, [number, track]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (await track(phone)) {
      sessionStorage.setItem(STORAGE_KEYS.guestBooking(number), phone);
    } else {
      setError(t('trackFailed'));
    }
  }

  if (loading) {
    return <div className="container-page py-16 text-center text-sm text-neutral-900/50">…</div>;
  }

  if (!booking) {
    return (
      <div className="container-page py-16">
        <div className="mx-auto max-w-md">
          <h1 className="text-2xl font-semibold text-neutral-900">{t('trackTitle')}</h1>
          <p className="mt-2 text-sm text-neutral-900/60">{t('trackBody', { number })}</p>

          <form onSubmit={submit} className="card mt-6 space-y-4 p-4">
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
              <p role="alert" className="notice notice-error">
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

  return (
    <div className="container-page py-8">
      {justBooked ? (
        <div className="mb-6 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
          <p className="text-sm font-medium text-accent-hover">{t('booked')}</p>
          <p className="mt-1 text-sm text-neutral-900/70">{t('bookedBody')}</p>
        </div>
      ) : null}

      <h1 className="text-2xl font-semibold text-neutral-900">
        {t('bookingTitle')} {booking.number}
      </h1>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="text-neutral-900/50">{t('fabric')}</dt>
          <dd className="text-neutral-900">
            {booking.fabricReceivedAt
              ? t('fabricReceivedOn', {
                  date: formatDate(booking.fabricReceivedAt, locale as Locale),
                })
              : t('fabricAwaited')}
          </dd>
        </div>
        {booking.promisedAt ? (
          <div>
            <dt className="text-neutral-900/50">{t('promised')}</dt>
            <dd className="text-neutral-900">
              {formatDate(booking.promisedAt, locale as Locale)}
            </dd>
          </div>
        ) : null}
        {booking.quotedFee !== null ? (
          <div>
            <dt className="text-neutral-900/50">{t('quote')}</dt>
            <dd className="text-neutral-900">{formatMoney(booking.quotedFee, locale)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-8 space-y-4">
        {booking.jobs.map((job) => (
          <section key={job.id} className="card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-neutral-900">
                {locale === 'ur' ? job.garmentType.labelUr : job.garmentType.labelEn}
              </h2>
              <span className="text-xs text-neutral-900/40">{job.number}</span>
            </div>

            {job.instructions ? (
              <p className="mt-1 text-sm text-neutral-900/60">{job.instructions}</p>
            ) : null}

            <div className="mt-4">
              <StitchingTimeline stage={job.stage} events={job.events} dueAt={job.dueAt} />
            </div>
          </section>
        ))}
      </div>

      {booking.fabricNotes ? (
        <p className="mt-6 text-sm text-neutral-900/60">{booking.fabricNotes}</p>
      ) : null}

      <Link href={ROUTES.storefront.shop} className="btn-secondary mt-8 inline-block">
        {t('continueShopping')}
      </Link>
    </div>
  );
}
