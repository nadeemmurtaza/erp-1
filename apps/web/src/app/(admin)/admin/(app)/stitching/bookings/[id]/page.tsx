'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { formatDate, formatMoney, toMinor } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { StageBadge } from '@/components/admin/stage-badge';
import { ROUTES } from '@/constants/routes';
import { Loading } from '@/components/ui';
import {
  BOOKING_STATUS_LABELS,
  fieldLabel,
  measurementValues,
  type StitchingBooking,
  type StitchingOrderStatus,
} from '@/types/stitching';

const STATUSES = Object.keys(BOOKING_STATUS_LABELS) as StitchingOrderStatus[];

/** One own-fabric booking: log the cloth in, quote the fee, follow the garments. */
export default function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [booking, setBooking] = useState<StitchingBooking | null>(null);
  const [fabricNote, setFabricNote] = useState('');
  const [quote, setQuote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBooking(await adminFetch<StitchingBooking>(`/admin/stitching/bookings/${id}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the booking');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/stitching/bookings/${id}/${path}`, { method: 'POST', body });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  }

  if (!booking) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading />
    );
  }

  return (
    <>
      <Link href={ROUTES.admin.stitchingBookings} className="text-sm text-accent-hover hover:underline">
        ← Back to bookings
      </Link>

      <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">{booking.number}</h1>
        <span className="rounded bg-neutral-50 px-2 py-0.5 text-xs font-medium text-accent-hover">
          {BOOKING_STATUS_LABELS[booking.status]}
        </span>
        <span className="text-sm text-neutral-900/60">
          {booking.guestName} · {booking.guestPhone}
        </span>
      </div>

      {error ? (
        <p role="alert" className="notice notice-error mb-4 whitespace-pre-line">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 fold:grid-cols-2 lg:grid-cols-3">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">The fabric</h2>
          <p className="text-sm text-neutral-900/70">{booking.fabricNotes ?? 'No notes.'}</p>

          {booking.fabricReceivedAt ? (
            <p className="mt-3 text-sm text-accent-hover">
              Logged in on {formatDate(booking.fabricReceivedAt)}
            </p>
          ) : (
            <div className="mt-3">
              <label className="block text-sm">
                <span className="mb-1 block text-neutral-900/60">Note (optional)</span>
                <input
                  value={fabricNote}
                  onChange={(event) => setFabricNote(event.target.value)}
                  className="field-input"
                  placeholder="Condition, quantity, who dropped it in"
                />
              </label>
              <button
                type="button"
                className="btn-primary mt-3"
                disabled={busy}
                onClick={() =>
                  void act('fabric-received', { note: fabricNote.trim() || undefined })
                }
              >
                Fabric received
              </button>
            </div>
          )}

          <h2 className="mb-2 mt-6 text-sm font-semibold text-neutral-900">Quote</h2>
          <p className="text-sm text-neutral-900/70">
            {booking.quotedFee === null
              ? 'Not quoted yet.'
              : `${formatMoney(booking.quotedFee)} quoted.`}
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min={0}
              step={50}
              value={quote}
              onChange={(event) => setQuote(event.target.value)}
              className="field-input"
              placeholder="Rupees"
              aria-label="Stitching fee in rupees"
            />
            <button
              type="button"
              className="btn-ghost"
              disabled={busy || !quote}
              onClick={() => void act('quote', { fee: toMinor(Number(quote)) })}
            >
              Save
            </button>
          </div>

          <h2 className="mb-2 mt-6 text-sm font-semibold text-neutral-900">Status</h2>
          <select
            className="field-input"
            value={booking.status}
            disabled={busy}
            onChange={(event) => void act('status', { status: event.target.value })}
          >
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {BOOKING_STATUS_LABELS[option]}
              </option>
            ))}
          </select>

          {booking.promisedAt ? (
            <p className="mt-4 text-sm text-neutral-900/60">
              Promised for {formatDate(booking.promisedAt)}
            </p>
          ) : null}
        </section>

        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Garments</h2>
          <ul className="space-y-4">
            {booking.jobs.map((job) => (
              <li key={job.id} className="border-b border-white pb-4 last:border-0">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/admin/stitching/jobs/${job.id}`}
                    className="font-medium text-neutral-900 hover:text-accent-hover"
                  >
                    {job.number}
                  </Link>
                  <span className="text-sm text-neutral-900/70">{job.garmentType.labelEn}</span>
                  <StageBadge stage={job.stage} />
                  <span className="text-xs text-neutral-900/60">
                    {job.assignedTailor?.firstName ?? 'Unassigned'}
                  </span>
                </div>

                {job.instructions ? (
                  <p className="mt-1 text-sm text-neutral-900/60">{job.instructions}</p>
                ) : null}

                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {measurementValues(job.measurementSnapshot).map(([key, value]) => (
                    <div key={key} className="flex gap-1">
                      <dt className="text-neutral-900/60">{fieldLabel(key)}</dt>
                      <dd className="tabular-nums text-neutral-900/80">{value}&quot;</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
