'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { formatDateTime } from '@newax/shared';
import { Link } from '@/i18n/navigation';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { getMySupportTicket, replySupportTicket, reopenSupportTicket } from '@/lib/customer-client';
import type { CustomerSupportTicketDetail } from '@/types/api';
import { Loading, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { ROUTES } from '@/constants/routes';

/** 148-external-customer-support-portal.md WO-148.4 — the customer's own ticket thread. */
export default function SupportTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useCustomerSession();
  const t = useTranslations('support');

  const [ticket, setTicket] = useState<CustomerSupportTicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [reopening, setReopening] = useState(false);

  const load = useCallback(async () => {
    try {
      setTicket(await getMySupportTicket(params.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this ticket');
    }
  }, [params.id]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function sendReply() {
    setSending(true);
    setError(null);
    try {
      await replySupportTicket(params.id, reply);
      setReply('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your reply');
    } finally {
      setSending(false);
    }
  }

  async function reopen() {
    setReopening(true);
    setError(null);
    try {
      await reopenSupportTicket(params.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reopen this ticket');
    } finally {
      setReopening(false);
    }
  }

  if (!ticket) {
    return (
      <>
        <PageHeader title={t('title')} />
        {error ? (
          <p role="alert" className="mb-4 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <Loading />
        )}
      </>
    );
  }

  const canReply = ticket.status !== 'CLOSED';

  return (
    <>
      <PageHeader
        title={ticket.subject}
        action={
          <Link href={ROUTES.storefront.accountSupport} className="btn-secondary">
            {t('backToTickets')}
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-neutral-900/60">
        <StatusBadge status={ticket.status} label={t(`status.${ticket.status}`)} />
        <span>{ticket.category}</span>
        <span>{t('raisedOn', { date: formatDateTime(ticket.createdAt) })}</span>
        {ticket.resolvedAt ? <span>{t('resolvedOn', { date: formatDateTime(ticket.resolvedAt) })}</span> : null}
      </div>

      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <ul className="mb-6 space-y-4">
        {ticket.messages.map((message) => (
          <li key={message.id} className={message.authorType === 'CUSTOMER' ? 'ms-0 me-8' : 'ms-8 me-0'}>
            <div className="rounded-md bg-neutral-50 p-3">
              <p className="mb-1 text-sm font-medium">{message.authorName}</p>
              <p className="whitespace-pre-wrap text-sm">{message.body}</p>
              <p className="mt-1 text-xs text-neutral-900/60">{formatDateTime(message.createdAt)}</p>
            </div>
          </li>
        ))}
      </ul>

      {ticket.status === 'RESOLVED' ? (
        <button type="button" className="btn-secondary" disabled={reopening} onClick={() => void reopen()}>
          {t('reopen')}
        </button>
      ) : canReply ? (
        <div className="max-w-lg space-y-3">
          <label className="field-label mb-1 block" htmlFor="ticket-reply">
            {t('reply')}
          </label>
          <textarea
            id="ticket-reply"
            className="field-input w-full"
            rows={4}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t('replyPlaceholder')}
          />
          <button type="button" className="btn-primary" disabled={sending || !reply.trim()} onClick={() => void sendReply()}>
            {t('sendReply')}
          </button>
        </div>
      ) : null}
    </>
  );
}
