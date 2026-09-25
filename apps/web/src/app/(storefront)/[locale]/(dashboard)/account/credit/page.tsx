'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatDate, formatMoney } from '@newax/shared';
import { PageHeader, Loading, Section, EmptyState } from '@/components/ui';
import { customerFetch } from '@/lib/customer-client';
import type { PaginatedResult } from '@/types/api';

interface LedgerEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  note: string | null;
  createdAt: string;
}

/** WO-7.4 — balance, full history, and redeeming a gift card into the account. */
export default function CreditPage() {
  const t = useTranslations('account.credit');
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  function reload() {
    customerFetch<{ balance: number }>('/store-credit').then((res) => setBalance(res.balance));
    customerFetch<PaginatedResult<LedgerEntry>>('/store-credit/ledger', { query: { page: 1, pageSize: 50 } }).then((res) =>
      setLedger(res.data),
    );
  }

  useEffect(reload, []);

  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    setRedeeming(true);
    setRedeemMessage(null);
    try {
      await customerFetch('/gift-cards/redeem-into-account', { method: 'POST', body: { code: redeemCode } });
      setRedeemMessage({ tone: 'success', text: t('redeemed') });
      setRedeemCode('');
      reload();
    } catch (cause) {
      setRedeemMessage({ tone: 'error', text: cause instanceof Error ? cause.message : t('redeemFailed') });
    } finally {
      setRedeeming(false);
    }
  }

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

      <Section title={t('redeemGiftCard')}>
        <form onSubmit={redeem} className="flex max-w-md items-end gap-2">
          <div className="flex-1">
            <label className="field-label" htmlFor="giftCardCode">
              {t('giftCardCode')}
            </label>
            <input
              id="giftCardCode"
              className="field-input"
              value={redeemCode}
              onChange={(event) => setRedeemCode(event.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={redeeming} className="btn-primary">
            {redeeming ? t('redeeming') : t('redeem')}
          </button>
        </form>
        {redeemMessage ? (
          <p className={redeemMessage.tone === 'error' ? 'notice notice-error mt-2' : 'notice notice-success mt-2'}>
            {redeemMessage.text}
          </p>
        ) : null}
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
                  <td>{entry.note ?? entry.reason}</td>
                  <td className="text-end tabular-nums">{formatMoney(entry.delta)}</td>
                  <td className="text-end tabular-nums text-neutral-900/60">{formatMoney(entry.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
