'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate, formatMoney, type Locale } from '@newax/shared';
import { Link } from '@/i18n/navigation';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { customerFetch } from '@/lib/customer-client';
import type { CustomerOrderSummary, PaginatedResult } from '@/types/api';
import { ROUTES } from '@/constants/routes';
import { StatusBadge } from '@/components/common/status-badge';
import { useOrderStatusLabel } from '@/hooks/use-order-status-label';
import { EmptyState, Loading, PageHeader } from '@/components/ui';

/**
 * Every order this account has placed.
 *
 * The sign-in guard and the page container both used to live here as well as
 * in the layout above, which is why this page sat in a container inside a
 * container with twice the padding. The layout owns both now; children never
 * render for a signed-out visitor, so this can fetch on mount.
 */
export default function OrderHistoryPage() {
  const { user } = useCustomerSession();
  const locale = useLocale() as Locale;
  const t = useTranslations('account.orders');
  const statusLabel = useOrderStatusLabel();

  const [orders, setOrders] = useState<PaginatedResult<CustomerOrderSummary> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrders(
        await customerFetch<PaginatedResult<CustomerOrderSummary>>('/orders/mine', {
          query: { page, pageSize: 10 },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('failed'));
    }
  }, [page, t]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  return (
    <>
      <PageHeader title={t('title')} description={t('body')} />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!orders ? (
        <Loading />
      ) : orders.data.length === 0 ? (
        <EmptyState
          title={t('empty')}
          description={t('emptyBody')}
          action={
            <Link href={ROUTES.storefront.shop} className="btn-primary">
              {t('startShopping')}
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {orders.data.map((order) => (
            <li key={order.number}>
              <Link
                href={ROUTES.storefront.order(order.number)}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4 transition-colors hover:bg-neutral-50"
              >
                <div className="min-w-0">
                  <p className="flex items-baseline gap-2 font-medium text-neutral-900">
                    {order.number}
                    <StatusBadge status={order.status} label={statusLabel(order.status)} />
                  </p>
                  <p className="mt-0.5 truncate text-sm text-neutral-900/60">
                    {order.items
                      .map((item) => (locale === 'ur' && item.nameUr ? item.nameUr : item.nameEn))
                      .join('، ')}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-sm font-medium text-neutral-900">
                    {formatMoney(order.grandTotal, locale)}
                  </p>
                  <p className="text-xs text-neutral-900/50">
                    {formatDate(order.placedAt, locale)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {orders && orders.meta.totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-between text-sm text-neutral-900/60">
          <span>
            {t('pageOf', {
              page: orders.meta.page,
              total: orders.meta.totalPages,
            })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!orders.meta.hasPrevious}
              onClick={() => setPage((current) => current - 1)}
              className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('previous')}
            </button>
            <button
              type="button"
              disabled={!orders.meta.hasNext}
              onClick={() => setPage((current) => current + 1)}
              className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('next')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
