'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { formatMoney, ORDER_STATUSES } from '@yaseen/shared';
import { adminFetch } from '@/lib/admin-client';
import type { PaginatedResponse } from '@/lib/api-types';

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
  items: Array<{
    id: string;
    nameEn: string;
    quantity: number;
    variantLabel: string | null;
    stitchingServiceName: string | null;
    measurementSnapshot: { label: string; values: Record<string, number> } | null;
    optionsSnapshot: Array<{ groupLabelEn: string; labelEn: string }> | null;
  }>;
  payments: Array<{ id: string; provider: string; status: string; receiptUrl: string | null }>;
  shipments: Array<{ courier: string; trackingNumber: string | null }>;
  statusEvents: Array<{ toStatus: string; createdAt: string; note: string | null }>;
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
  const [expanded, setExpanded] = useState<string | null>(null);
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
      <h1 className="mb-1 text-xl font-semibold text-ink">Orders</h1>
      <p className="mb-6 text-sm text-ink/60">
        Confirm, prepare and dispatch. Cancelling an order puts its stock back.
      </p>

      <div className="card mb-4 flex flex-wrap gap-3 p-3">
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
              {label(option)}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p role="alert" className="card mb-4 whitespace-pre-line p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-sand-200 bg-sand-50">
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Payment</Th>
                <Th>Status</Th>
                <Th className="text-end">Total</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {!orders ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink/50">
                    Loading…
                  </td>
                </tr>
              ) : orders.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink/50">
                    No orders match those filters.
                  </td>
                </tr>
              ) : (
                orders.data.flatMap((order) => [
                  <tr key={order.id} className="hover:bg-sand-50">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                        className="font-medium text-ink hover:text-brand-700"
                      >
                        {order.number}
                      </button>
                      <p className="text-xs text-ink/40">
                        {new Date(order.placedAt).toLocaleDateString('en-PK')}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{order.guestName ?? '—'}</p>
                      <p className="text-xs text-ink/40">
                        {order.guestPhone} · {order.shippingAddress.city}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {order.payments.map((payment) => (
                        <p key={payment.id} className="text-xs">
                          <span className="text-ink/70">{payment.provider}</span>
                          <span
                            className={clsx(
                              'ms-1 font-medium',
                              payment.status === 'PAID' ? 'text-brand-700' : 'text-gold',
                            )}
                          >
                            {payment.status.toLowerCase().replace(/_/g, ' ')}
                          </span>
                        </p>
                      ))}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-ink">
                      {formatMoney(order.grandTotal)}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex flex-wrap justify-end gap-1">
                        {(NEXT_STATUS[order.status] ?? []).map((next) => (
                          <button
                            key={next}
                            type="button"
                            disabled={busy}
                            onClick={() => void advance(order, next)}
                            className={clsx(
                              'rounded px-2 py-1 text-xs',
                              next === 'CANCELLED' || next === 'RETURNED'
                                ? 'text-red-700 hover:bg-red-50'
                                : 'text-brand-700 hover:bg-brand-50',
                            )}
                          >
                            {label(next)}
                          </button>
                        ))}
                        {order.status === 'READY_TO_SHIP' || order.status === 'SHIPPED' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void addTracking(order)}
                            className="rounded px-2 py-1 text-xs text-ink/60 hover:bg-sand-100"
                          >
                            Tracking
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>,
                  expanded === order.id ? (
                    <tr key={`${order.id}-detail`} className="bg-sand-50">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="grid gap-6 lg:grid-cols-2">
                          <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                              Items
                            </h3>
                            <ul className="mt-2 space-y-2">
                              {order.items.map((item) => (
                                <li key={item.id} className="text-sm">
                                  <p className="text-ink">
                                    {item.nameEn} × {item.quantity}
                                    {item.variantLabel ? (
                                      <span className="text-ink/50"> · {item.variantLabel}</span>
                                    ) : null}
                                  </p>
                                  {item.stitchingServiceName ? (
                                    <div className="mt-1 rounded bg-white p-2 text-xs">
                                      <p className="font-medium text-brand-800">
                                        {item.stitchingServiceName}
                                      </p>
                                      {item.optionsSnapshot?.length ? (
                                        <p className="text-ink/70">
                                          {item.optionsSnapshot
                                            .map(
                                              (option) =>
                                                `${option.groupLabelEn}: ${option.labelEn}`,
                                            )
                                            .join(' · ')}
                                        </p>
                                      ) : null}
                                      {item.measurementSnapshot ? (
                                        <p className="mt-1 text-ink/70">
                                          {item.measurementSnapshot.label}:{' '}
                                          {Object.entries(item.measurementSnapshot.values)
                                            .map(([key, value]) => `${key} ${value}"`)
                                            .join(', ')}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                              History
                            </h3>
                            <ol className="mt-2 space-y-1 text-sm">
                              {order.statusEvents.map((event, index) => (
                                <li key={index} className="text-ink/70">
                                  {label(event.toStatus)}
                                  <span className="ms-2 text-xs text-ink/40">
                                    {new Date(event.createdAt).toLocaleString('en-PK')}
                                  </span>
                                  {event.note ? (
                                    <span className="block text-xs text-ink/50">{event.note}</span>
                                  ) : null}
                                </li>
                              ))}
                            </ol>

                            {order.shipments.length > 0 ? (
                              <p className="mt-3 text-sm text-ink/70">
                                {order.shipments
                                  .map(
                                    (shipment) =>
                                      `${shipment.courier.toUpperCase()} ${shipment.trackingNumber ?? ''}`,
                                  )
                                  .join(', ')}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ])
              )}
            </tbody>
          </table>
        </div>

        {orders && orders.meta.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-sand-200 px-4 py-3 text-sm">
            <button
              type="button"
              className="btn-ghost"
              disabled={!orders.meta.hasPrevious}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <span className="text-ink/60">
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

function label(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        'rounded px-2 py-0.5 text-xs font-medium',
        status === 'DELIVERED' && 'bg-brand-100 text-brand-800',
        status === 'CANCELLED' && 'bg-red-50 text-red-700',
        status === 'RETURNED' && 'bg-red-50 text-red-700',
        status === 'PENDING' && 'bg-sand-100 text-ink/60',
        !['DELIVERED', 'CANCELLED', 'RETURNED', 'PENDING'].includes(status) &&
          'bg-brand-50 text-brand-700',
      )}
    >
      {label(status)}
    </span>
  );
}
