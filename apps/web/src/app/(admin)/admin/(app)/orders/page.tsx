'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/utils/cn';
import { ORDER_STATUSES, formatDate, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import type { PaginatedResponse } from '@/types/api';
import {
  DataTable,
  FilterBar,
  Pagination,
  PageHeader,
  useFilterPage,
  useFilterParam,
  useSetFilterPage,
} from '@/components/ui';
import { StatusBadge, statusLabel } from '@/components/common/status-badge';
import { paymentProviderLabel } from '@/constants/payment-methods';
import { useAdminSession } from '@/components/admin/session';

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
  const status = useFilterParam('status');
  const q = useFilterParam('q');
  const page = useFilterPage();
  const setPage = useSetFilterPage();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { can } = useAdminSession();

  const canViewInsights = can('analytics.view');

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
    // FilterBar debounces the search box before it touches the URL.
    load();
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
        action={
          canViewInsights ? (
            <Link href={ROUTES.admin.orderInsights} className="btn-secondary">
              Insights
            </Link>
          ) : undefined
        }
      />

      <FilterBar
        filters={[
          { key: 'q', type: 'search', placeholder: 'Order number, name or phone' },
          {
            key: 'status',
            type: 'select',
            placeholder: 'All statuses',
            options: ORDER_STATUSES.map((option) => ({ value: option, label: statusLabel(option) })),
          },
        ]}
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4 whitespace-pre-line">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        <DataTable
          rows={orders?.data ?? null}
          loading={!orders}
          emptyLabel="No orders match those filters. Clear the search or choose a different status to see more."
          rowKey={(order) => order.id}
          columns={[
            {
              header: 'Order',
              cell: (order) => (
                <>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="font-medium text-neutral-900 hover:text-accent-hover"
                  >
                    {order.number}
                  </Link>
                  <p className="text-xs text-neutral-900/60">{formatDate(order.placedAt)}</p>
                </>
              ),
            },
            {
              header: 'Customer',
              cell: (order) => (
                <>
                  <p className="text-neutral-900">{order.guestName ?? '—'}</p>
                  <p className="text-xs text-neutral-900/60">
                    {order.guestPhone} · {order.shippingAddress.city}
                  </p>
                </>
              ),
            },
            {
              header: 'Payment',
              cell: (order) =>
                order.payments.map((payment) => (
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
                )),
            },
            { header: 'Status', cell: (order) => <StatusBadge status={order.status} /> },
            {
              header: 'Total',
              align: 'end',
              numeric: true,
              cell: (order) => formatMoney(order.grandTotal),
            },
            {
              header: '',
              align: 'end',
              cell: (order) => (
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
              ),
            },
          ]}
        />

        {orders ? <Pagination meta={orders.meta} onChange={setPage} itemLabel="orders" /> : null}
      </div>
    </>
  );
}
