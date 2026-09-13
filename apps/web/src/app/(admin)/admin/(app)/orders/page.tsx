'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/utils/cn';
import { ORDER_STATUSES, formatDate, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import type { PaginatedResponse } from '@/types/api';
import { EmptyState, Loading, PageHeader } from '@/components/ui';
import { StatusBadge, statusLabel } from '@/components/common/status-badge';
import { paymentProviderLabel } from '@/constants/payment-methods';

interface AdminOrder {
  id: string;
  number: string;
  status: string;
  placedAt: string;
  guestName: string | null;
  guestPhone: string | null;
  grandTotal: number;
  shippingZone: string | null;
  shippingAddress: { city: string; province: string };
  payments: Array<{ id: string; provider: string; status: string; receiptUrl: string | null }>;
}

/** Which status a staff member may move an order to next. Mirrors the API. */
const NEXT_STATUS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['READY_TO_SHIP', 'CANCELLED'],
  READY_TO_SHIP: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<PaginatedResponse<AdminOrder> | null>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(
        await adminFetch<PaginatedResponse<AdminOrder>>('/admin/orders', {
          query: { status: status || undefined, q: q || undefined, page, pageSize: 20 },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load orders');
    }
  }, [status, q, page]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function advance(order: AdminOrder, next: string) {
    const note =
      next === 'CANCELLED'
        ? (window.prompt('Why is this order being cancelled?') ?? undefined)
        : undefined;

    // Cancelling restores stock, so it is worth a moment's pause.
    if (next === 'CANCELLED' && note === undefined) return;

    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/orders/${order.id}/status`, {
        method: 'POST',
        body: { status: next, note },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the order');
    } finally {
      setBusy(false);
    }
  }

  async function addTracking(order: AdminOrder) {
    const trackingNumber = window.prompt('Tracking number');
    if (!trackingNumber) return;

    const courier = window.prompt('Courier (tcs, leopards, manual)', 'manual') ?? 'manual';

    setBusy(true);
    try {
      await adminFetch(`/admin/orders/${order.id}/shipments`, {
        method: 'POST',
        body: { courier, trackingNumber },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the shipment');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Orders"
        description="Confirm, prepare and dispatch. Cancelling an order puts its stock back."
      />

      <div className="mb-6 flex flex-wrap gap-3 border-b border-neutral-100 pb-4">
        <input
          type="search"
          placeholder="Order number, name or phone"
          value={q}
          onChange={(event) => {
            setPage(1);
            setQ(event.target.value);
          }}
          className="field-input max-w-xs"
        />
        <select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value);
          }}
          className="field-input w-auto"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((option) => (
            <option key={option} value={option}>
              {statusLabel(option)}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p role="alert" className="notice notice-error mb-4 whitespace-pre-line">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-flat">
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Payment</Th>
                <Th>Status</Th>
                <Th className="text-end">Total</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-white">
              {!orders ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center">
                    <Loading className="p-0" />
                  </td>
                </tr>
              ) : orders.data.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title="No orders match those filters"
                      description="Clear the search or choose a different status to see more."
                    />
                  </td>
                </tr>
              ) : (
                orders.data.map((order) => (
                  <tr key={order.id} className="hover:bg-neutral-50">
                    <td>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-medium text-neutral-900 hover:text-accent-hover"
                      >
                        {order.number}
                      </Link>
                      <p className="text-xs text-neutral-900/40">
                        {formatDate(order.placedAt)}
                      </p>
                    </td>
                    <td>
                      <p className="text-neutral-900">{order.guestName ?? '—'}</p>
                      <p className="text-xs text-neutral-900/40">
                        {order.guestPhone} · {order.shippingAddress.city}
                      </p>
                    </td>
                    <td>
                      {order.payments.map((payment) => (
                        <p key={payment.id} className="text-xs">
                          <span className="text-neutral-900/70">{paymentProviderLabel(payment.provider)}</span>
                          <span
                            className={cn(
                              'ms-1 font-medium',
                              payment.status === 'PAID' ? 'text-accent-hover' : 'text-amber-600',
                            )}
                          >
                            {statusLabel(payment.status)}
                          </span>
                        </p>
                      ))}
                    </td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="text-end tabular-nums text-neutral-900">
                      {formatMoney(order.grandTotal)}
                    </td>
                    <td className="text-end">
                      <div className="flex flex-wrap justify-end gap-1">
                        {(NEXT_STATUS[order.status] ?? []).map((next) => (
                          <button
                            key={next}
                            type="button"
                            disabled={busy}
                            onClick={() => void advance(order, next)}
                            className={cn(
                              'rounded px-2 py-1 text-xs',
                              next === 'CANCELLED' || next === 'RETURNED'
                                ? 'text-red-700 hover:bg-red-50'
                                : 'text-accent-hover hover:bg-neutral-50',
                            )}
                          >
                            {statusLabel(next)}
                          </button>
                        ))}
                        {order.status === 'READY_TO_SHIP' || order.status === 'SHIPPED' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void addTracking(order)}
                            className="rounded px-2 py-1 text-xs text-neutral-900/60 hover:bg-white"
                          >
                            Tracking
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {orders && orders.meta.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm">
            <button
              type="button"
              className="btn-ghost"
              disabled={!orders.meta.hasPrevious}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <span className="text-neutral-900/60">
              Page {orders.meta.page} of {orders.meta.totalPages} · {orders.meta.total} orders
            </span>
            <button
              type="button"
              className="btn-ghost"
              disabled={!orders.meta.hasNext}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}


function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th scope="col"
      className={cn(
        'px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-neutral-900/50',
        className,
      )}
    >
      {children}
    </th>
  );
}

