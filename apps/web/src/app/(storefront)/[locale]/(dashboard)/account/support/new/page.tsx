'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { raiseSupportTicket } from '@/lib/customer-client';
import { PageHeader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

/** 148-external-customer-support-portal.md WO-148.4 — mirrors returns/new/page.tsx's own form shape. */
export default function NewSupportTicketPage() {
  const t = useTranslations('support');
  const router = useRouter();

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [body, setBody] = useState('');
  const [orderId, setOrderId] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('NORMAL');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const ticket = await raiseSupportTicket({
        subject,
        category,
        body,
        orderId: orderId.trim() || undefined,
        priority,
      });
      router.push(ROUTES.storefront.accountSupportTicket(ticket.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not raise this ticket');
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title={t('raiseAction')} />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="max-w-lg space-y-4">
        <div>
          <label className="field-label mb-1 block" htmlFor="ticket-subject">
            {t('subject')}
          </label>
          <input id="ticket-subject" className="field-input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div>
          <label className="field-label mb-1 block" htmlFor="ticket-category">
            {t('category')}
          </label>
          <input
            id="ticket-category"
            className="field-input w-full"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={t('categoryPlaceholder')}
          />
        </div>

        <div>
          <label className="field-label mb-1 block" htmlFor="ticket-order">
            {t('orderNumber')}
          </label>
          <input id="ticket-order" className="field-input w-full" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
        </div>

        <div>
          <label className="field-label mb-1 block" htmlFor="ticket-priority">
            {t('priority')}
          </label>
          <select
            id="ticket-priority"
            className="field-input w-full"
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priorityLevel.${p}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label mb-1 block" htmlFor="ticket-body">
            {t('message')}
          </label>
          <textarea
            id="ticket-body"
            className="field-input w-full"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('messagePlaceholder')}
          />
        </div>

        <button
          type="button"
          className="btn-primary"
          disabled={submitting || !subject.trim() || !category.trim() || !body.trim()}
          onClick={() => void submit()}
        >
          {t('submit')}
        </button>
      </div>
    </>
  );
}
