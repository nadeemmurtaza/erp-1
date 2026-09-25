'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { formatDate, formatDateTime, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import { Button, Dialog, Disclosure, Loading, PageHeader } from '@/components/ui';
import { StatusBadge, statusLabel } from '@/components/common/status-badge';
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
  userId: string | null;
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
  codRiskScore: number | null;
  codRiskAction: string | null;
  codRiskReasonEn: string | null;
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
  const { can } = useAdminSession();
  const canApprovePayments = can('payments.approve');

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
      // WO-6.4 — shipment booking moved to the fulfilment module; this
      // quick action still lives here since the order is already in
      // context, same UX as before.
      await adminFetch(`/admin/fulfilment/shipments`, {
        method: 'POST',
        body: { orderId: id, courier, trackingNumber },
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
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    );
  }

  if (!order) {
    return (
      <p role="alert" className="notice notice-error">
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
        title={
          <span className="flex items-center gap-3">
            {order.number}
            <StatusBadge status={order.status} />
            {order.codRiskAction && order.codRiskAction !== 'AUTO_CONFIRM' ? (
              <StatusBadge status={order.codRiskAction} />
            ) : null}
          </span>
        }
        description={
          <>
            {order.guestName ?? '—'} · {order.guestPhone ?? '—'} · Placed {formatDateTime(order.placedAt)}
            {order.userId && can('giftcards.view') ? (
              <>
                {' · '}
                <Link href={`/admin/customers/${order.userId}`} className="hover:underline">
                  Store credit
                </Link>
              </>
            ) : null}
            {order.codRiskAction && order.codRiskAction !== 'AUTO_CONFIRM' && order.codRiskReasonEn ? (
              <span className="mt-1 block text-amber-700">{order.codRiskReasonEn}</span>
            ) : null}
          </>
        }
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
        <p role="alert" className="notice notice-error mb-4 whitespace-pre-line">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 fold:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="overflow-hidden">
            <h2 className="border-b border-neutral-100 bg-neutral-50 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-neutral-900/60">
              Items
            </h2>
            <ul className="divide-y divide-neutral-100">
              {order.items.map((item) => (
                <li key={item.id} className="p-4">
                  <div className="flex justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">{item.nameEn}</p>
                      <p className="text-xs text-neutral-900/60">
                        {[item.variantLabel, item.sku].filter(Boolean).join(' · ')} × {item.quantity}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-sm font-medium text-neutral-900">{formatMoney(item.lineTotal)}</p>
                      {item.discountUnit > 0 ? (
                        <p className="text-xs text-neutral-900/60">-{formatMoney(item.discountUnit)}/unit discount</p>
                      ) : null}
                    </div>
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
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-900/60">Shipments</h2>
              <ul className="mt-2 space-y-1 text-sm text-neutral-900/70">
                {order.shipments.map((shipment) => (
                  <li key={shipment.id}>
                    {shipment.courier.toUpperCase()}
                    {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}
                    <span className="ms-2 text-xs text-neutral-900/60">
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
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-900/60">Summary</h2>
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
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-900/60">Payments</h2>
            <ul className="space-y-4">
              {order.payments.map((payment) => (
                <li key={payment.id} className="border-b border-white pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-neutral-900">{paymentProviderLabel(payment.provider)}</span>
                    <StatusBadge status={payment.status} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-900/60">{formatMoney(payment.amount)}</p>
                  {payment.reference ? (
                    <p className="text-xs text-neutral-900/60">Ref {payment.reference}</p>
                  ) : null}
                  {payment.providerRef ? (
                    <p className="text-xs text-neutral-900/60">Gateway ref {payment.providerRef}</p>
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

          <InstalmentPlanSection orderId={id} onOrderChanged={load} />

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-900/60">
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
                <span className="ms-2 text-xs text-neutral-900/60">
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



interface InstalmentPaymentRow {
  id: string;
  receivedAt: string;
  isDeposit: boolean;
  payment: { amount: number; provider: string };
}

interface InstalmentScheduleRow {
  id: string;
  dueDate: string;
  amountMinor: number;
}

interface InstalmentPlanDetail {
  id: string;
  type: 'LAYBY' | 'INSTALMENT';
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED';
  totalMinor: number;
  depositMinor: number;
  schedule: InstalmentScheduleRow[];
  payments: InstalmentPaymentRow[];
}

/**
 * finance-accounting/151-layby-installment-sales.md WO-151.5 — the plan's
 * own detail: schedule and every actual payment, side by side (the doc's
 * own "click the number" lens), never a bare "40% paid" figure. Silently
 * absent for an order with no plan — an ordinary immediate-tender sale,
 * today's exact majority case.
 */
function InstalmentPlanSection({ orderId, onOrderChanged }: { orderId: string; onOrderChanged: () => void }) {
  const { can } = useAdminSession();
  const canOperate = can('pos.operate');
  const canCancel = can('pos.instalments.cancel');
  const canDefault = can('pos.instalments.default');

  const [plan, setPlan] = useState<InstalmentPlanDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [amountRupees, setAmountRupees] = useState('');

  const load = useCallback(() => {
    adminFetch<InstalmentPlanDetail>(`/admin/orders/${orderId}/instalments`)
      .then(setPlan)
      .catch(() => setPlan(null));
  }, [orderId]);

  useEffect(load, [load]);

  if (plan === undefined || plan === null) return null;

  const paidSoFar = plan.payments.reduce((sum, p) => sum + p.payment.amount, 0);
  const remaining = plan.totalMinor - paidSoFar;

  const recordPayment = async () => {
    const amountMinor = Math.round((Number(amountRupees) || 0) * 100);
    if (amountMinor <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/orders/${orderId}/instalments/payments`, {
        method: 'POST',
        body: { amountMinor, provider: 'cash' },
      });
      setPayOpen(false);
      setAmountRupees('');
      load();
      onOrderChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record this payment');
    } finally {
      setBusy(false);
    }
  };

  const cancelPlan = async () => {
    if (!confirm('Cancel this plan? The deposit is refunded or forfeited per the configured policy.')) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/orders/${orderId}/instalments/cancel`, { method: 'POST' });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not cancel this plan');
    } finally {
      setBusy(false);
    }
  };

  const markDefaulted = async () => {
    if (!confirm('Mark this plan defaulted? This writes off the unpaid balance.')) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/orders/${orderId}/instalments/default`, { method: 'POST' });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not mark this plan defaulted');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-900/60">
          {plan.type === 'LAYBY' ? 'Layby plan' : 'Instalment plan'}
        </h2>
        <StatusBadge status={plan.status} />
      </div>

      {error ? (
        <p role="alert" className="notice notice-error mb-3">
          {error}
        </p>
      ) : null}

      <dl className="space-y-2 text-sm">
        <Row label="Total" value={formatMoney(plan.totalMinor)} />
        <Row label="Paid so far" value={formatMoney(paidSoFar)} />
        <Row label="Remaining" value={formatMoney(remaining)} />
      </dl>

      <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-900/60">Schedule</h3>
      <ul className="space-y-1 text-sm text-neutral-900/70">
        {plan.schedule.map((line) => (
          <li key={line.id} className="flex justify-between">
            <span>{formatDate(line.dueDate)}</span>
            <span>{formatMoney(line.amountMinor)}</span>
          </li>
        ))}
      </ul>

      <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-900/60">
        Payments received
      </h3>
      {plan.payments.length === 0 ? (
        <p className="text-sm text-neutral-900/60">None yet.</p>
      ) : (
        <ul className="space-y-1 text-sm text-neutral-900/70">
          {plan.payments.map((p) => (
            <li key={p.id} className="flex justify-between">
              <span>
                {formatDate(p.receivedAt)} {p.isDeposit ? '· deposit' : ''}
              </span>
              <span>{formatMoney(p.payment.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {plan.status === 'ACTIVE' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {canOperate ? (
            <Button variant="secondary" onClick={() => setPayOpen(true)} disabled={busy}>
              Record payment
            </Button>
          ) : null}
          {canCancel ? (
            <Button variant="danger" onClick={() => void cancelPlan()} disabled={busy}>
              Cancel plan
            </Button>
          ) : null}
          {canDefault ? (
            <Button variant="danger" onClick={() => void markDefaulted()} disabled={busy}>
              Mark defaulted
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record an instalment payment"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void recordPayment()} disabled={busy || !amountRupees} loading={busy}>
              Record
            </Button>
          </div>
        }
      >
        <label htmlFor="instalment-amount" className="field-label">
          Amount (Rs)
        </label>
        <input
          id="instalment-amount"
          type="number"
          min="0"
          step="0.01"
          className="field-input mt-1 w-full"
          value={amountRupees}
          onChange={(e) => setAmountRupees(e.target.value)}
          placeholder="0.00"
        />
        <p className="mt-2 text-xs text-neutral-900/60">Remaining: {formatMoney(remaining)}</p>
      </Dialog>
    </section>
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
