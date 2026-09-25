'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatDate, formatMoney } from '@newax/shared';
import { PageHeader, Loading, Section, EmptyState } from '@/components/ui';
import { customerFetch } from '@/lib/customer-client';
import type { PaginatedResult } from '@/types/api';

interface WalletEntry {
  id: string;
  type: 'PURCHASE' | 'RESERVE' | 'REDEEM' | 'RELEASE_RESERVATION' | 'REFUND' | 'ADJUSTMENT';
  amountMinor: number;
  orderId: string | null;
  createdAt: string;
}

/**
 * doc 155 (WO-155.5) — the customer's own wallet balance and history.
 * Reachable only when `wallet` is enabled (see dashboard-nav.tsx's own
 * module gate) — no deployment enables it today (DECISIONS.md), so this
 * page exists and is built but is not linked from anywhere live.
 */
export default function WalletPage() {
  const t = useTranslations('account.wallet');
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<WalletEntry[]>([]);

  useEffect(() => {
    customerFetch<{ balance: number }>('/wallet').then((res) => setBalance(res.balance));
    customerFetch<PaginatedResult<WalletEntry>>('/wallet/ledger', { query: { page: 1, pageSize: 50 } }).then((res) =>
      setLedger(res.data),
    );
  }, []);

  if (balance === null) {
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

      <Section title={t('balance')}>
        <p className="text-3xl font-semibold tabular-nums">{formatMoney(balance)}</p>
      </Section>

      <Section title={t('history')}>
        {ledger.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <table className="table-flat w-full text-sm">
            <tbody>
              {ledger.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.createdAt)}</td>
                  <td>{t(`entryType.${entry.type}`)}</td>
                  <td className="text-end tabular-nums">{formatMoney(entry.amountMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
