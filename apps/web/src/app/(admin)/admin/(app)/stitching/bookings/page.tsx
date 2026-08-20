'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { formatMoney } from '@yaseen/shared';
import { adminFetch } from '@/lib/admin-client';
import {
  BOOKING_STATUS_LABELS,
  type StitchingBooking,
  type StitchingOrderStatus,
} from '@/lib/stitching-types';

const STATUSES = Object.keys(BOOKING_STATUS_LABELS) as StitchingOrderStatus[];

/**
 * Bookings where the customer supplies the cloth.
 *
 * These sit in front of the tailor queue: the jobs exist from the moment the
 * booking is made, but the shop has no fabric until someone logs it in.
 */
export default function BookingsPage() {
  const [bookings, setBookings] = useState<StitchingBooking[] | null>(null);
  const [status, setStatus] = useState<StitchingOrderStatus | ''>('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBookings(
        await adminFetch<StitchingBooking[]>('/admin/stitching/bookings', {
          query: { status: status || undefined },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load bookings');
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Stitching bookings</h1>
      <p className="mb-6 text-sm text-ink/60">
        Tailoring on the customer&apos;s own fabric. Log the cloth in when it arrives —
        that is what releases the garments to the workshop.
      </p>

      <div className="card mb-4 flex flex-wrap gap-3 p-3">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StitchingOrderStatus | '')}
          className="field-input w-auto"
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((option) => (
            <option key={option} value={option}>
              {BOOKING_STATUS_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-sand-200 bg-sand-50">
              <tr>
                <Th>Booking</Th>
                <Th>Customer</Th>
                <Th>Garments</Th>
                <Th>Status</Th>
                <Th>Fabric</Th>
                <Th className="text-end">Quote</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {!bookings ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink/50">
                    Loading…
                  </td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink/50">
                    No bookings yet.
                  </td>
                </tr>
              ) : (
                bookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-sand-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/stitching/bookings/${booking.id}`}
                        className="font-medium text-ink hover:text-brand-700"
                      >
                        {booking.number}
                      </Link>
                      <p className="text-xs text-ink/40">
                        {new Date(booking.createdAt).toLocaleDateString('en-PK')}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{booking.guestName ?? '—'}</p>
                      <p className="text-xs text-ink/40">{booking.guestPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-ink/70">
                      {booking.jobs.map((job) => job.garmentType.labelEn).join(', ')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          'rounded px-2 py-0.5 text-xs font-medium',
                          booking.status === 'CANCELLED'
                            ? 'bg-red-50 text-red-700'
                            : booking.status === 'AWAITING_FABRIC'
                              ? 'bg-sand-100 text-ink/60'
                              : 'bg-brand-50 text-brand-700',
                        )}
                      >
                        {BOOKING_STATUS_LABELS[booking.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink/70">
                      {booking.fabricReceivedAt
                        ? new Date(booking.fabricReceivedAt).toLocaleDateString('en-PK')
                        : 'Not yet in'}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-ink">
                      {booking.quotedFee === null ? '—' : formatMoney(booking.quotedFee)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={clsx(
        'px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-ink/50',
        className,
      )}
    >
      {children}
    </th>
  );
}
