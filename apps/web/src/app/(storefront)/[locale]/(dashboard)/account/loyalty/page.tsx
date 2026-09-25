'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatDate, formatMoney } from '@newax/shared';
import { PageHeader, Loading, Section, EmptyState } from '@/components/ui';
import { customerFetch } from '@/lib/customer-client';
import type { PaginatedResult } from '@/types/api';

interface LoyaltyBalance {
  points: number;
  tier: { name: string } | null;
  trailing12MonthSpend: number;
}

interface LoyaltyLedgerEntry {
  id: string;
  type: string;
  points: number;
  note: string | null;
  createdAt: string;
}

interface Referral {
  id: string;
  rewardedAt: string | null;
  createdAt: string;
}

/** WO-7.7 — points, tiers, redemption, and referrals. */
export default function LoyaltyPage() {
  const t = useTranslations('account.loyalty');
  const [balance, setBalance] = useState<LoyaltyBalance | null>(null);
  const [ledger, setLedger] = useState<LoyaltyLedgerEntry[]>([]);
  const [redeemPoints, setRedeemPoints] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [applyCode, setApplyCode] = useState('');
  const [applyMessage, setApplyMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  function reload() {
    customerFetch<LoyaltyBalance>('/loyalty').then(setBalance);
    customerFetch<PaginatedResult<LoyaltyLedgerEntry>>('/loyalty/ledger', { query: { page: 1, pageSize: 50 } }).then((res) =>
      setLedger(res.data),
    );
    customerFetch<Referral[]>('/loyalty/referrals').then(setReferrals);
  }

  useEffect(reload, []);

  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    setRedeeming(true);
    setRedeemMessage(null);
    try {
      await customerFetch('/loyalty/redeem', { method: 'POST', body: { points: Number(redeemPoints) } });
      setRedeemMessage({ tone: 'success', text: t('redeemed') });
      setRedeemPoints('');
      reload();
    } catch (cause) {
      setRedeemMessage({ tone: 'error', text: cause instanceof Error ? cause.message : t('redeemFailed') });
    } finally {
      setRedeeming(false);
    }
  }

  async function getCode() {
    const result = await customerFetch<{ code: string }>('/loyalty/referral-code');
    setCode(result.code);
  }

  async function applyReferralCode(event: React.FormEvent) {
    event.preventDefault();
    setApplyMessage(null);
    try {
      await customerFetch('/loyalty/referral/apply', { method: 'POST', body: { code: applyCode } });
      setApplyMessage({ tone: 'success', text: t('applied') });
      setApplyCode('');
    } catch (cause) {
      setApplyMessage({ tone: 'error', text: cause instanceof Error ? cause.message : t('applyFailed') });
    }
  }

  if (!balance) {
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title={t('points')}>
          <p className="text-3xl font-semibold tabular-nums">{balance.points}</p>
          <p className="mt-1 text-sm text-neutral-900/60">
            {t('tier')}: {balance.tier?.name ?? t('noTier')}
          </p>
          <p className="text-sm text-neutral-900/60">
            {t('trailingSpend')}: {formatMoney(balance.trailing12MonthSpend)}
          </p>
        </Section>

        <Section title={t('redeem')}>
          <form onSubmit={redeem} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="field-label" htmlFor="redeemPoints">
                {t('redeemAmount')}
              </label>
              <input
                id="redeemPoints"
                type="number"
                min={1}
                className="field-input"
                value={redeemPoints}
                onChange={(event) => setRedeemPoints(event.target.value)}
                required
              />
            </div>
            <button type="submit" disabled={redeeming} className="btn-primary">
              {t('redeemSubmit')}
            </button>
          </form>
          {redeemMessage ? (
            <p className={redeemMessage.tone === 'error' ? 'notice notice-error mt-2' : 'notice notice-success mt-2'}>
              {redeemMessage.text}
            </p>
          ) : null}
        </Section>
      </div>

      <Section title={t('referralTitle')} description={t('referralBody')}>
        <div className="flex flex-wrap items-center gap-3">
          {code ? <span className="pill font-mono">{code}</span> : (
            <button type="button" onClick={getCode} className="btn-secondary">
              {t('getCode')}
            </button>
          )}
        </div>

        {referrals.length > 0 ? (
          <p className="mt-3 text-sm text-neutral-900/60">
            {t('myReferrals')}: {referrals.length} ({referrals.filter((r) => r.rewardedAt).length} rewarded)
          </p>
        ) : null}

        <form onSubmit={applyReferralCode} className="mt-4 flex max-w-sm items-end gap-2">
          <div className="flex-1">
            <label className="field-label" htmlFor="applyCode">
              {t('applyCode')}
            </label>
            <input
              id="applyCode"
              className="field-input"
              placeholder={t('applyCodePlaceholder')}
              value={applyCode}
              onChange={(event) => setApplyCode(event.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-secondary">
            {t('apply')}
          </button>
        </form>
        {applyMessage ? (
          <p className={applyMessage.tone === 'error' ? 'notice notice-error mt-2' : 'notice notice-success mt-2'}>
            {applyMessage.text}
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
                  <td>{entry.note ?? entry.type}</td>
                  <td className="text-end tabular-nums">{entry.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
