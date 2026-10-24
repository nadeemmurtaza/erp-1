'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatDate } from '@newax/shared';
import { Link } from '@/i18n/navigation';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { listMySupportTickets } from '@/lib/customer-client';
import type { CustomerSupportTicket } from '@/types/api';
import { EmptyState, Loading, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { ROUTES } from '@/constants/routes';

/** 148-external-customer-support-portal.md WO-148.4 — mirrors returns/page.tsx's own shape. */
export default function MySupportTicketsPage() {
  const { user } = useCustomerSession();
  const t = useTranslations('support');
  const [tickets, setTickets] = useState<CustomerSupportTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTickets(await listMySupportTickets());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your tickets');
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  return (
    <>
      <PageHeader
        title={t('title')}
        action={
          <Link href={ROUTES.storefront.accountSupportNew} className="btn-primary">
            {t('raiseAction')}
          </Link>
        }
      />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!tickets ? (
        <Loading />
      ) : tickets.length === 0 ? (
        <EmptyState
          title={t('noTickets')}
          action={
            <Link href={ROUTES.storefront.accountSupportNew} className="btn-primary">
              {t('raiseAction')}
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <Link href={ROUTES.storefront.accountSupportTicket(ticket.id)} className="font-medium text-accent-hover hover:underline">
                  {ticket.subject}
                </Link>
                <p className="text-sm text-neutral-900/60">
                  {ticket.category} · {formatDate(ticket.createdAt)}
                </p>
              </div>
              <StatusBadge status={ticket.status} label={t(`status.${ticket.status}`)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
