'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { formatDate, formatMoney } from '@newax/shared';
import { PageHeader, Loading, Section, EmptyState, Disclosure } from '@/components/ui';
import { customerFetch, getMyOrder } from '@/lib/customer-client';
import type { CustomerOrderSummary, PaginatedResult } from '@/types/api';

const REASON_CODES = ['DEFECTIVE', 'WRONG_ITEM', 'DAMAGED_IN_TRANSIT', 'SIZE_FIT_ISSUE', 'CHANGED_MIND', 'OTHER'] as const;
const REASON_LABEL_KEY: Record<(typeof REASON_CODES)[number], string> = {
  DEFECTIVE: 'reasonDefective',
  WRONG_ITEM: 'reasonWrongItem',
  DAMAGED_IN_TRANSIT: 'reasonDamagedInTransit',
  SIZE_FIT_ISSUE: 'reasonSizeFitIssue',
  CHANGED_MIND: 'reasonChangedMind',
  OTHER: 'reasonOther',
};
const STATUS_LABEL_KEY = {
  REQUESTED: 'statusRequested',
  APPROVED: 'statusApproved',
  REJECTED: 'statusRejected',
  REFUNDED: 'statusRefunded',
} as const;

interface OrderItemLite {
  id: string;
  nameEn: string;
  quantity: number;
  lineTotal: number;
  stitchingServiceId: string | null;
}

interface ReturnRequestView {
  id: string;
  status: keyof typeof STATUS_LABEL_KEY;
  reasonCode: string;
  note: string | null;
  decisionNote: string | null;
  createdAt: string;
  order: { number: string };
}

/** WO-7.3 — the customer's self-service return flow, end to end without contacting the shop. */
export default function ReturnsPage() {
  const t = useTranslations('account.returns');
  const searchParams = useSearchParams();
  const preselectedOrder = searchParams.get('order');

  const [requests, setRequests] = useState<ReturnRequestView[] | null>(null);
  const [deliveredOrders, setDeliveredOrders] = useState<CustomerOrderSummary[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<string>(preselectedOrder ?? '');
  const [eligibility, setEligibility] = useState<{ eligible: boolean; reason?: string } | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItemLite[]>([]);
  const [selectedLines, setSelectedLines] = useState<Record<string, number>>({});
  const [reasonCode, setReasonCode] = useState<(typeof REASON_CODES)[number]>('DEFECTIVE');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  function reload() {
    customerFetch<ReturnRequestView[]>('/returns').then(setRequests).catch(() => setRequests([]));
  }

  useEffect(() => {
    reload();
    customerFetch<PaginatedResult<CustomerOrderSummary>>('/orders/mine', { query: { page: 1, pageSize: 50 } })
      .then((res) => setDeliveredOrders(res.data.filter((o) => o.status === 'DELIVERED')))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedOrder) {
      setEligibility(null);
      setOrderItems([]);
      return;
    }
    customerFetch<{ eligible: boolean; reason?: string }>(`/returns/eligibility/${selectedOrder}`).then(setEligibility);
    getMyOrder(selectedOrder)
      .then((order) => setOrderItems(order.items as unknown as OrderItemLite[]))
      .catch(() => setOrderItems([]));
  }, [selectedOrder]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const lines = Object.entries(selectedLines)
        .filter(([, qty]) => qty > 0)
        .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
      if (lines.length === 0) throw new Error(t('selectLines'));

      await customerFetch('/returns', {
        method: 'POST',
        body: { orderNumber: selectedOrder, lines, reasonCode, note: note || undefined },
      });
      setMessage({ tone: 'success', text: t('submitted') });
      setSelectedOrder('');
      setSelectedLines({});
      setNote('');
      reload();
    } catch (cause) {
      setMessage({ tone: 'error', text: cause instanceof Error ? cause.message : t('failed') });
    } finally {
      setSubmitting(false);
    }
  }

  if (requests === null) {
    return (
      <>
        <PageHeader title={t('title')} description={t('body')} />
        <Loading />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('title')} description={t('body')} />

      <Disclosure label={t('newRequest')}>
        <form onSubmit={submit} className="max-w-xl space-y-4">
          <div>
            <label className="field-label" htmlFor="returnOrder">
              {t('selectOrder')}
            </label>
            <select
              id="returnOrder"
              className="field-input"
              value={selectedOrder}
              onChange={(event) => {
                setSelectedOrder(event.target.value);
                setSelectedLines({});
              }}
              required
            >
              <option value="">—</option>
              {deliveredOrders.map((order) => (
                <option key={order.number} value={order.number}>
                  {order.number} — {formatDate(order.placedAt)}
                </option>
              ))}
            </select>
          </div>

          {eligibility && !eligibility.eligible ? (
            <p className="notice notice-error">{t('notEligible', { reason: eligibility.reason ?? '' })}</p>
          ) : null}

          {eligibility?.eligible && orderItems.length > 0 ? (
            <div>
              <p className="field-label">{t('selectLines')}</p>
              <ul className="space-y-2">
                {orderItems
                  .filter((item) => !item.stitchingServiceId)
                  .map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                      <span>
                        {item.nameEn} ({formatMoney(item.lineTotal)})
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        className="field-input w-20"
                        value={selectedLines[item.id] ?? 0}
                        onChange={(event) =>
                          setSelectedLines((prev) => ({ ...prev, [item.id]: Number(event.target.value) }))
                        }
                      />
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          <div>
            <label className="field-label" htmlFor="reasonCode">
              {t('reason')}
            </label>
            <select
              id="reasonCode"
              className="field-input"
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value as (typeof REASON_CODES)[number])}
            >
              {REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {t(REASON_LABEL_KEY[code])}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="returnNote">
              {t('note')}
            </label>
            <textarea id="returnNote" className="field-input" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>

          {message ? (
            <p className={message.tone === 'error' ? 'notice notice-error' : 'notice notice-success'}>{message.text}</p>
          ) : null}

          <button type="submit" disabled={submitting || !eligibility?.eligible} className="btn-primary">
            {submitting ? t('submitting') : t('submit')}
          </button>
        </form>
      </Disclosure>

      <Section title={t('title')}>
        {requests.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
            {requests.map((request) => (
              <li key={request.id} className="space-y-1 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{request.order.number}</span>
                  <span className="pill">{t(STATUS_LABEL_KEY[request.status])}</span>
                </div>
                <p className="text-neutral-900/60">{t('requestedOn', { date: formatDate(request.createdAt) })}</p>
                {request.decisionNote ? (
                  <p className="text-neutral-900/70">
                    {t('decisionNote')}: {request.decisionNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
