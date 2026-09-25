'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatMoney } from '@newax/shared';
import { PageHeader, Loading, Section } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { Link } from '@/i18n/navigation';
import { customerFetch } from '@/lib/customer-client';
import { ROUTES } from '@/constants/routes';
import type { CustomerOrderSummary, PaginatedResult } from '@/types/api';

interface LoyaltyBalance {
  points: number;
  tier: { name: string } | null;
}

interface ReturnRequestSummary {
  id: string;
  status: string;
}

/**
 * WO-7.1's own words: "a real dashboard, not a link list" — the most recent
 * order with its live status, store credit balance, loyalty points, and
 * anything needing action (a return request still awaiting a decision).
 */
export default function AccountOverviewPage() {
  const t = useTranslations('account.overview');
  const [recentOrder, setRecentOrder] = useState<CustomerOrderSummary | null>(null);
  const [storeCredit, setStoreCredit] = useState<number | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyBalance | null>(null);
  const [pendingReturns, setPendingReturns] = useState<ReturnRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      customerFetch<PaginatedResult<CustomerOrderSummary>>('/orders/mine', { query: { page: 1, pageSize: 1 } }).catch(() => null),
      customerFetch<{ balance: number }>('/store-credit').catch(() => null),
      customerFetch<LoyaltyBalance>('/loyalty').catch(() => null),
      customerFetch<ReturnRequestSummary[]>('/returns').catch(() => []),
    ]).then(([orders, credit, loyaltyBalance, returns]) => {
      if (cancelled) return;
      setRecentOrder(orders?.data[0] ?? null);
      setStoreCredit(credit?.balance ?? null);
      setLoyalty(loyaltyBalance);
      setPendingReturns((returns ?? []).filter((r) => r.status === 'APPROVED'));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Section title={t('recentOrder')}>
          {recentOrder ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{recentOrder.number}</span>
                <StatusBadge status={recentOrder.status} />
              </div>
              <p className="text-sm tabular-nums text-neutral-900/60">{formatMoney(recentOrder.grandTotal)}</p>
              <Link href={ROUTES.storefront.order(recentOrder.number)} className="btn-text text-sm">
                {t('viewOrder')}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-neutral-900/60">{t('noOrders')}</p>
          )}
        </Section>

        <Section title={t('storeCredit')}>
          <p className="text-2xl font-semibold tabular-nums">{formatMoney(storeCredit ?? 0)}</p>
          <Link href={ROUTES.storefront.accountCredit} className="btn-text text-sm">
            {t('viewCredit')}
          </Link>
        </Section>

        <Section title={t('loyaltyPoints')}>
          <p className="text-2xl font-semibold tabular-nums">{loyalty?.points ?? 0}</p>
          {loyalty?.tier ? <p className="text-sm text-neutral-900/60">{loyalty.tier.name}</p> : null}
          <Link href={ROUTES.storefront.accountLoyalty} className="btn-text text-sm">
            {t('viewLoyalty')}
          </Link>
        </Section>
      </div>

      <Section title={t('actionNeeded')}>
        {pendingReturns.length === 0 ? (
          <p className="text-sm text-neutral-900/60">{t('noActionNeeded')}</p>
        ) : (
          <ul className="space-y-2">
            {pendingReturns.map((r) => (
              <li key={r.id}>
                <Link href={ROUTES.storefront.accountReturns} className="text-sm text-accent-hover hover:underline">
                  {t('pendingReturn')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
