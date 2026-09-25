'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatDate, formatMoney } from '@newax/shared';
import { Link } from '@/i18n/navigation';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { listMyReturns } from '@/lib/customer-client';
import type { CustomerReturnRequest } from '@/types/api';
import { EmptyState, Loading, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { ROUTES } from '@/constants/routes';

/** WO-6.6 — the customer's own returns, mirroring orders/page.tsx's shape. */
export default function MyReturnsPage() {
  const { user } = useCustomerSession();
  const t = useTranslations('returns');
  const [returns, setReturns] = useState<CustomerReturnRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReturns(await listMyReturns());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your returns');
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  return (
    <>
      <PageHeader title={t('title')} />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!returns ? (
        <Loading />
      ) : returns.length === 0 ? (
        <EmptyState title={t('noReturns')} />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {returns.map((request) => (
            <li key={request.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <Link href={ROUTES.storefront.accountReturn(request.id)} className="font-medium text-accent-hover hover:underline">
                  {request.number}
                </Link>
                <p className="text-sm text-neutral-900/60">
                  {request.order.number} · {formatDate(request.requestedAt)}
                  {request.refundAmount != null ? ` · ${formatMoney(request.refundAmount)}` : ''}
                </p>
              </div>
              <StatusBadge status={request.status} label={t(`status.${request.status}`)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
