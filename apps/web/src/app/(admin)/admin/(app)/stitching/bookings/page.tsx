'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { formatDate, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, FilterBar, useFilterParam } from '@/components/ui';
import {
  BOOKING_STATUS_LABELS,
  type StitchingBooking,
  type StitchingOrderStatus,
} from '@/types/stitching';

const STATUSES = Object.keys(BOOKING_STATUS_LABELS) as StitchingOrderStatus[];

/**
 * Bookings where the customer supplies the cloth.
 *
 * These sit in front of the tailor queue: the jobs exist from the moment the
 * booking is made, but the shop has no fabric until someone logs it in.
 */
export default function BookingsPage() {
  const [bookings, setBookings] = useState<StitchingBooking[] | null>(null);
  const status = useFilterParam('status') as StitchingOrderStatus | '';
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
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Stitching bookings</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Tailoring on the customer&apos;s own fabric. Log the cloth in when it arrives —
        that is what releases the garments to the workshop.
      </p>

      <FilterBar
        filters={[
          {
            key: 'status',
            type: 'select',
            placeholder: 'All statuses',
            options: STATUSES.map((option) => ({
              value: option,
              label: BOOKING_STATUS_LABELS[option],
            })),
          },
        ]}
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        <DataTable
          rows={bookings}
          loading={!bookings}
          emptyLabel="No bookings yet."
          rowKey={(booking) => booking.id}
          columns={[
            {
              header: 'Booking',
              cell: (booking) => (
                <>
                  <Link
                    href={`/admin/stitching/bookings/${booking.id}`}
                    className="font-medium text-neutral-900 hover:text-accent-hover"
                  >
                    {booking.number}
                  </Link>
                  <p className="text-xs text-neutral-900/60">{formatDate(booking.createdAt)}</p>
                </>
              ),
            },
            {
              header: 'Customer',
              cell: (booking) => (
                <>
                  <p className="text-neutral-900">{booking.guestName ?? '—'}</p>
                  <p className="text-xs text-neutral-900/60">{booking.guestPhone}</p>
                </>
              ),
            },
            {
              header: 'Garments',
              muted: true,
              cell: (booking) => booking.jobs.map((job) => job.garmentType.labelEn).join(', '),
            },
            {
              header: 'Status',
              cell: (booking) => (
                <span
                  className={cn(
                    'rounded px-2 py-0.5 text-xs font-medium',
                    booking.status === 'CANCELLED'
                      ? 'bg-red-50 text-red-700'
                      : booking.status === 'AWAITING_FABRIC'
                        ? 'bg-white text-neutral-900/60'
                        : 'bg-neutral-50 text-accent-hover',
                  )}
                >
                  {BOOKING_STATUS_LABELS[booking.status]}
                </span>
              ),
            },
            {
              header: 'Fabric',
              muted: true,
              cell: (booking) =>
                booking.fabricReceivedAt ? formatDate(booking.fabricReceivedAt) : 'Not yet in',
            },
            {
              header: 'Quote',
              align: 'end',
              numeric: true,
              cell: (booking) => (booking.quotedFee === null ? '—' : formatMoney(booking.quotedFee)),
            },
          ]}
        />
      </div>
    </>
  );
}
