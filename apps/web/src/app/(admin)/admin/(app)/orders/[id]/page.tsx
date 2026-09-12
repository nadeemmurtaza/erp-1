'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDate, formatDateTime, formatMoney } from '@newax/shared';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import { Disclosure, Loading, PageHeader } from '@/components/ui';
import { StatusBadge, statusLabel } from '@/components/admin/status-badge';
import { paymentProviderLabel } from '@/constants/payment-methods';

interface OrderItem {
  id: string;
  nameEn: string;
  variantLabel: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  stitchingFeeUnit: number;
  discountUnit: number;
  lineTotal: number;
  stitchingServiceName: string | null;
  measurementSnapshot: { label: string; values: Record<string, number> } | null;
  optionsSnapshot: Array<{ groupLabelEn: string; labelEn: string }> | null;
  stitchingJob: { number: string; stage: string; dueAt: string | null } | null;
}

interface Payment {
  id: string;
  provider: string;
  status: string;
  amount: number;
  reference: string | null;
  providerRef: string | null;
  receiptUrl: string | null;
  failureReason: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  refundAmount: number | null;
}

interface Shipment {
  id: string;
  courier: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  createdAt: string;
}

interface StatusEvent {
  toStatus: string;
  createdAt: string;
  note: string | null;
}

interface Address {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  province: string;
}

interface OrderDetail {
  id: string;
  number: string;
  status: string;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  shippingAddress: Address;
  billingAddress: Address | null;
  itemsSubtotal: number;
  stitchingSubtotal: number;
  itemDiscountTotal: number;
  orderDiscount: number;
  shippingFee: number;
  codFee: number;
  taxAmount: number;
  grandTotal: number;
  customerNote: string | null;
  staffNote: string | null;
  cancelReason: string | null;
  placedAt: string;
  items: OrderItem[];
  payments: Payment[];
  shipments: Shipment[];
  statusEvents: StatusEvent[];
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

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const canApprovePayments = getStoredUser()?.permissions.includes('payments.approve') ?? false;

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrder(await adminFetch<OrderDetail>(`/admin/orders/${id}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this order');
    } finally {
      setBusy(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function advance(next: string) {
    const note =
      next === 'CANCELLED'
        ? (window.prompt('Why is this order being cancelled?') ?? undefined)
        : undefined;
    if (next === 'CANCELLED' && note === undefined) return;

    setBusy(true);
    try {
      await adminFetch(`/admin/orders/${id}/status`, { method: 'POST', body: { status: next, note } });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the order');
      setBusy(false);
    }
  }

  async function addTracking() {
    const trackingNumber = window.prompt('Tracking number');
    if (!trackingNumber) return;
    const courier = window.prompt('Courier (tcs, leopards, manual)', 'manual') ?? 'manual';

    setBusy(true);
    try {
      await adminFetch(`/admin/orders/${id}/shipments`, {
        method: 'POST',
        body: { courier, trackingNumber },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the shipment');
      setBusy(false);
    }
  }

  async function approvePayment(payment: Payment) {
    const note = window.prompt('Approval note (optional)') ?? undefined;
    setBusy(true);
    try {
      await adminFetch(`/admin/payments/${payment.id}/approve`, { method: 'POST', body: { note } });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not approve this payment');
      setBusy(false);
    }
  }

  async function refundPayment(payment: Payment) {
    const amountInput = window.prompt(
      `Refund amount in PKR (leave blank to refund the full ${formatMoney(payment.amount)})`,
    );
    if (amountInput === null) return;
    const note = window.prompt('Refund note (optional)') ?? undefined;
    const amount = amountInput.trim() ? Math.round(parseFloat(amountInput) * 100) : undefined;
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
      setError('Enter a valid refund amount.');
      return;
    }

    setBusy(true);
    try {
      await adminFetch(`/admin/payments/${payment.id}/refund`, {
        method: 'POST',
        body: { amount, note },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refund this payment');
      setBusy(false);
    }
  }

  if (busy && !order) {
    return <Loading label="Loading order" />;
  }

  if (error && !order) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!order) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        Order not found.
      </p>
    );
  }

  // Cancelling and returning are not "next steps" — they undo the order, and
  // one of them puts stock back. They belong at the bottom with the rest of
  // the destructive actions, not beside the button that moves it forward.
  const transitions = NEXT_STATUS[order.status] ?? [];
  const forward = transitions.filter((next) => next !== 'CANCELLED' && next !== 'RETURNED');
  const undoing = transitions.filter((next) => next === 'CANCELLED' || next === 'RETURNED');

  return (
    <>
      <PageHeader
        context={
          <Link href={ROUTES.admin.orders} className="hover:text-neutral-900">
            ← Orders
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            {order.number}
            <StatusBadge status={order.status} />
          </span>
        }
        description={`${order.guestName ?? '—'} · ${order.guestPhone ?? '—'} · Placed ${formatDateTime(order.placedAt)}`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            {forward.map((next) => (
              <button
                key={next}
                type="button"
                disabled={busy}
                onClick={() => void advance(next)}
                className="btn-primary"
              >
                {statusLabel(next)}
              </button>
            ))}
            {order.status === 'READY_TO_SHIP' || order.status === 'SHIPPED' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void addTracking()}
                className="btn-secondary"
              >
                Record shipment
              </button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <p role="alert" className="card mb-4 whitespace-pre-line p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 fold:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card overflow-hidden">
            <h2 className="border-b border-neutral-100 bg-neutral-50 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-neutral-900/50">
              Items
            </h2>
            <ul className="divide-y divide-white">
              {order.items.map((item) => (
                <li key={item.id} className="p-4">
                  <div className="flex justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">{item.nameEn}</p>
                      <p className="text-xs text-neutral-900/50">
                        {[item.variantLabel, item.sku].filter(Boolean).join(' · ')} × {item.quantity}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium text-neutral-900">{formatMoney(item.lineTotal)}</p>
                  </div>

                  {item.stitchingServiceName ? (
                    <div className="mt-2 rounded-md bg-neutral-50 p-2.5 text-xs">
                      <p className="font-medium text-accent-hover">
                        {item.stitchingServiceName} · {formatMoney(item.stitchingFeeUnit)}
                      </p>
                      {item.optionsSnapshot?.length ? (
                        <p className="mt-1 text-neutral-900/70">
                          {item.optionsSnapshot
                            .map((option) => `${option.groupLabelEn}: ${option.labelEn}`)
                            .join(' · ')}
                        </p>
                      ) : null}
                      {item.measurementSnapshot ? (
                        <p className="mt-1 text-neutral-900/70">
                          Measurements: {item.measurementSnapshot.label} —{' '}
                          {Object.entries(item.measurementSnapshot.values)
                            .map(([key, value]) => `${key} ${value}"`)
                            .join(', ')}
                        </p>
                      ) : null}
                      {item.stitchingJob ? (
                        <p className="mt-1 text-neutral-900/70">
                          {item.stitchingJob.number} · {statusLabel(item.stitchingJob.stage)}
                          {item.stitchingJob.dueAt
                            ? ` · due ${formatDate(item.stitchingJob.dueAt)}`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          {order.shipments.length > 0 ? (
            <section className="card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-900/50">Shipments</h2>
              <ul className="mt-2 space-y-1 text-sm text-neutral-900/70">
                {order.shipments.map((shipment) => (
                  <li key={shipment.id}>
                    {shipment.courier.toUpperCase()}
                    {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}
                    <span className="ms-2 text-xs text-neutral-900/40">
                      {formatDateTime(shipment.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {order.customerNote || order.staffNote || order.cancelReason ? (
            <section className="space-y-2 text-sm">
              {order.customerNote ? (
                <p>
                  <span className="font-medium text-neutral-900">Customer note: </span>
                  <span className="text-neutral-900/70">{order.customerNote}</span>
                </p>
              ) : null}
              {order.staffNote ? (
                <p>
                  <span className="font-medium text-neutral-900">Staff note: </span>
                  <span className="text-neutral-900/70">{order.staffNote}</span>
                </p>
              ) : null}
              {order.cancelReason ? (
                <p>
                  <span className="font-medium text-red-700">Cancellation reason: </span>
                  <span className="text-neutral-900/70">{order.cancelReason}</span>
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-900/50">Summary</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Items" value={formatMoney(order.itemsSubtotal)} />
              {order.stitchingSubtotal > 0 ? (
                <Row label="Stitching" value={formatMoney(order.stitchingSubtotal)} />
              ) : null}
              {order.itemDiscountTotal > 0 ? (
                <Row label="Item discounts" value={`-${formatMoney(order.itemDiscountTotal)}`} />
              ) : null}
              {order.orderDiscount > 0 ? (
                <Row label="Order discount" value={`-${formatMoney(order.orderDiscount)}`} />
              ) : null}
              <Row
                label="Shipping"
                value={order.shippingFee === 0 ? 'Free' : formatMoney(order.shippingFee)}
              />
              {order.codFee > 0 ? <Row label="COD fee" value={formatMoney(order.codFee)} /> : null}
              {order.taxAmount > 0 ? <Row label="Tax" value={formatMoney(order.taxAmount)} /> : null}
            </dl>
            <div className="mt-3 flex justify-between border-t border-neutral-100 pt-3">
              <span className="text-sm font-medium text-neutral-900">Total</span>
              <span className="text-lg font-semibold text-neutral-900">{formatMoney(order.grandTotal)}</span>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-900/50">Payments</h2>
            <ul className="space-y-4">
              {order.payments.map((payment) => (
                <li key={payment.id} className="border-b border-white pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-neutral-900">{paymentProviderLabel(payment.provider)}</span>
                    <StatusBadge status={payment.status} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-900/60">{formatMoney(payment.amount)}</p>
                  {payment.reference ? (
                    <p className="text-xs text-neutral-900/40">Ref {payment.reference}</p>
                  ) : null}
                  {payment.providerRef ? (
                    <p className="text-xs text-neutral-900/40">Gateway ref {payment.providerRef}</p>
                  ) : null}
                  {payment.receiptUrl ? (
                    <a
                      href={payment.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-accent-hover hover:underline"
                    >
                      View receipt
                    </a>
                  ) : null}
                  {payment.failureReason ? (
                    <p className="text-xs text-red-700">{payment.failureReason}</p>
                  ) : null}
                  {payment.refundAmount ? (
                    <p className="text-xs text-neutral-900/60">
                      Refunded {formatMoney(payment.refundAmount)}
                      {payment.refundedAt
                        ? ` on ${formatDate(payment.refundedAt)}`
                        : ''}
                    </p>
                  ) : null}

                  {canApprovePayments ? (
                    <div className="mt-2 flex gap-2">
                      {payment.status !== 'PAID' && payment.status !== 'REFUNDED' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void approvePayment(payment)}
                          className="rounded px-2 py-1 text-xs font-medium text-accent-hover hover:bg-neutral-50"
                        >
                          Approve
                        </button>
                      ) : null}
                      {payment.status === 'PAID' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void refundPayment(payment)}
                          className="rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Refund
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-900/50">
              Delivering to
            </h2>
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
          </section>
        </div>
      </div>

      <Disclosure label={`History · ${order.statusEvents.length} ${order.statusEvents.length === 1 ? 'event' : 'events'}`}>
        <ol className="space-y-3">
          {order.statusEvents.map((event, index) => (
            <li key={index} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
              <span>
                <span className="font-medium text-neutral-900">{statusLabel(event.toStatus)}</span>
                <span className="ms-2 text-xs text-neutral-900/40">
                  {formatDateTime(event.createdAt)}
                </span>
                {event.note ? (
                  <span className="block text-xs text-neutral-900/60">{event.note}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </Disclosure>

      {undoing.length > 0 ? (
        <Disclosure label="Cancel or return this order">
          <p className="mb-3 max-w-prose text-sm text-neutral-900/60">
            Cancelling or returning puts the order&apos;s stock back. Neither can be undone
            from here.
          </p>
          <div className="flex flex-wrap gap-2">
            {undoing.map((next) => (
              <button
                key={next}
                type="button"
                disabled={busy}
                onClick={() => void advance(next)}
                className="btn-danger"
              >
                {statusLabel(next)}
              </button>
            ))}
          </div>
        </Disclosure>
      ) : null}
    </>
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
