'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatDate, formatMoney } from '@newax/shared';
import { PageHeader, Loading, Section, EmptyState } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { customerFetch } from '@/lib/customer-client';

interface Approver {
  id: string;
  name: string;
  phoneE164: string | null;
}

interface B2BAccount {
  id: string;
  isActive: boolean;
  requiresPurchaseOrder: boolean;
  approvalPolicy: { thresholdMinor: number; approvers: Approver[] } | null;
}

interface OrderRequest {
  id: string;
  amountMinor: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CONVERTED';
  requestedByName: string | null;
  createdAt: string;
  orderId: string | null;
}

/**
 * 149-b2b-accounts-approvals-sector-packs.md (WO-149.4) — the buyer's own
 * B2B dashboard: their standing account, their account's own approval
 * policy (read; editing it is the account's own primary contact's job,
 * done through AccountsService.setMyApprovalPolicy() — not yet wired to a
 * picker here, since no customer-facing contact directory exists to pick
 * an approver from, 163-personal-api-keys.md §4's own deliberate gap), and
 * the two lists that actually need action: orders waiting on MY approval,
 * and my own submitted requests.
 */
export default function B2BAccountPage() {
  const t = useTranslations('account.b2b');
  const [account, setAccount] = useState<B2BAccount | null | undefined>(undefined);
  const [pending, setPending] = useState<OrderRequest[]>([]);
  const [mine, setMine] = useState<OrderRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    customerFetch<B2BAccount | null>('/accounts/mine').then(setAccount);
    customerFetch<{ data: OrderRequest[] }>('/accounts/mine/pending-approvals').then((res) => setPending(res.data));
    customerFetch<{ data: OrderRequest[] }>('/accounts/mine/order-requests').then((res) => setMine(res.data));
  };

  useEffect(load, []);

  const decide = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    setBusyId(id);
    setError(null);
    try {
      await customerFetch(`/accounts/mine/order-requests/${id}/decide`, { method: 'POST', body: { decision } });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('decideFailed'));
    } finally {
      setBusyId(null);
    }
  };

  if (account === undefined) {
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

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <Section title={t('myAccount')}>
        {account ? (
          <div className="card p-6 space-y-2">
            <p className="flex items-center gap-2">
              {account.isActive ? (
                <StatusBadge status="ACTIVE" label={t('active')} />
              ) : (
                <StatusBadge status="CANCELLED" label={t('inactive')} />
              )}
              {account.requiresPurchaseOrder ? <span className="text-sm text-neutral-900/60">{t('requiresPo')}</span> : null}
            </p>
            {account.approvalPolicy ? (
              <p className="text-sm text-neutral-900/60">
                {t('thresholdLine', { amount: formatMoney(account.approvalPolicy.thresholdMinor) })}
                {' — '}
                {t('approversLine', { count: account.approvalPolicy.approvers.length })}
                {account.approvalPolicy.approvers.length > 0
                  ? `: ${account.approvalPolicy.approvers.map((a) => a.name).join(', ')}`
                  : ''}
              </p>
            ) : (
              <p className="text-sm text-neutral-900/60">{t('noPolicy')}</p>
            )}
          </div>
        ) : (
          <EmptyState title={t('noAccount')} description={t('noAccountBody')} />
        )}
      </Section>

      <Section title={t('pendingApprovals')}>
        {pending.length === 0 ? (
          <EmptyState title={t('noPending')} />
        ) : (
          <ul className="space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="card flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-neutral-900">{formatMoney(r.amountMinor)}</p>
                  <p className="text-sm text-neutral-900/60">
                    {t('requestedBy', { name: r.requestedByName ?? t('unknown') })} · {formatDate(r.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => decide(r.id, 'REJECT')}
                    disabled={busyId === r.id}
                    className="btn-secondary"
                  >
                    {t('reject')}
                  </button>
                  <button onClick={() => decide(r.id, 'APPROVE')} disabled={busyId === r.id} className="btn-primary">
                    {t('approve')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('myRequests')}>
        {mine.length === 0 ? (
          <EmptyState title={t('noRequests')} />
        ) : (
          <table className="table-flat w-full text-sm">
            <tbody>
              {mine.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.createdAt)}</td>
                  <td className="text-end tabular-nums">{formatMoney(r.amountMinor)}</td>
                  <td className="text-end">
                    <StatusBadge status={r.status} label={t(`status.${r.status}`)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
