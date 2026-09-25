'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime, formatMoney } from '@newax/shared';
import { PageHeader, Section, DataTable, EmptyState } from '@/components/ui';
import type { PaginatedResult } from '@/types/api';

interface WalletAccount {
  id: string;
  customerId: string;
  status: 'ACTIVE' | 'FROZEN' | 'CLOSED';
  currency: string;
}

interface WalletEntry {
  id: string;
  type: string;
  amountMinor: number;
  orderId: string | null;
  reason: string | null;
  createdAt: string;
}

/**
 * doc 155 (WO-155.5) — a customer's wallet balance and full ledger, plus
 * the manual-adjustment and freeze/close actions `finance.wallets.adjust`/
 * `.adjust.approve` gate. Off by default (`wallet` module) — see
 * DECISIONS.md. A staff member starts from the customer they are helping
 * (their id), not an opaque wallet account id — the same reason the
 * customer-facing screen exists at /account/wallet rather than only here.
 */
export default function WalletAdminPage() {
  const [customerId, setCustomerId] = useState('');
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<WalletEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustMessage, setAdjustMessage] = useState<string | null>(null);

  async function load(event: React.FormEvent) {
    event.preventDefault();
    if (!customerId.trim()) return;
    setLoading(true);
    setError(null);
    setAccount(null);
    setBalance(null);
    setLedger(null);
    try {
      const acc = await adminFetch<WalletAccount>(`/admin/wallet/customers/${encodeURIComponent(customerId.trim())}`);
      setAccount(acc);
      const result = await adminFetch<PaginatedResult<WalletEntry> & { balance: number }>(`/admin/wallet/accounts/${acc.id}/ledger`, {
        query: { page: 1, pageSize: 50 },
      });
      setBalance(result.balance);
      setLedger(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this wallet.');
    } finally {
      setLoading(false);
    }
  }

  async function submitAdjustment(event: React.FormEvent) {
    event.preventDefault();
    if (!account) return;
    setAdjusting(true);
    setAdjustMessage(null);
    try {
      const result = await adminFetch<{ committed: boolean }>(`/admin/wallet/accounts/${account.id}/adjustments`, {
        method: 'POST',
        body: { amountMinor: Number(adjustAmount), reason: adjustReason },
      });
      setAdjustMessage(
        result.committed
          ? 'Adjustment applied.'
          : 'This amount is at or above the auto-approval threshold — it now needs a different approver.',
      );
      setAdjustAmount('');
      setAdjustReason('');
      const refreshed = await adminFetch<PaginatedResult<WalletEntry> & { balance: number }>(`/admin/wallet/accounts/${account.id}/ledger`, {
        query: { page: 1, pageSize: 50 },
      });
      setBalance(refreshed.balance);
      setLedger(refreshed.data);
    } catch (cause) {
      setAdjustMessage(cause instanceof Error ? cause.message : 'Could not apply that adjustment.');
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <>
      <PageHeader title="Wallets" description="A customer's own store-credit balance and history — search by their customer id." />

      <Section title="Find a wallet">
        <form onSubmit={load} className="flex max-w-md items-end gap-2">
          <div className="flex-1">
            <label className="field-label" htmlFor="customerId">
              Customer id
            </label>
            <input
              id="customerId"
              className="field-input"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Loading…' : 'Load'}
          </button>
        </form>
        {error ? (
          <p role="alert" className="notice notice-error mt-2">
            {error}
          </p>
        ) : null}
      </Section>

      {account ? (
        <>
          <Section title="Balance">
            <p className="text-3xl font-semibold tabular-nums">{formatMoney(balance ?? 0)}</p>
            <p className="mt-1 text-sm text-neutral-900/60">Status: {account.status}</p>
          </Section>

          <Section title="Manual adjustment">
            <form onSubmit={submitAdjustment} className="flex max-w-xl flex-wrap items-end gap-2">
              <div>
                <label className="field-label" htmlFor="adjustAmount">
                  Amount (paisa, negative to debit)
                </label>
                <input
                  id="adjustAmount"
                  type="number"
                  className="field-input"
                  value={adjustAmount}
                  onChange={(event) => setAdjustAmount(event.target.value)}
                  required
                />
              </div>
              <div className="flex-1">
                <label className="field-label" htmlFor="adjustReason">
                  Reason
                </label>
                <input
                  id="adjustReason"
                  className="field-input"
                  value={adjustReason}
                  onChange={(event) => setAdjustReason(event.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={adjusting} className="btn-secondary">
                {adjusting ? 'Applying…' : 'Apply'}
              </button>
            </form>
            {adjustMessage ? <p className="notice notice-info mt-2">{adjustMessage}</p> : null}
          </Section>

          <Section title="History">
            {ledger && ledger.length === 0 ? (
              <EmptyState title="No transactions yet." />
            ) : (
              <DataTable
                rows={ledger}
                loading={ledger === null}
                rowKey={(entry) => entry.id}
                columns={[
                  { header: 'Date', cell: (entry) => formatDateTime(entry.createdAt), muted: true },
                  { header: 'Type', cell: (entry) => entry.type },
                  { header: 'Order', cell: (entry) => entry.orderId ?? '—', muted: true },
                  { header: 'Reason', cell: (entry) => entry.reason ?? '—', muted: true },
                  { header: 'Amount', cell: (entry) => formatMoney(entry.amountMinor), align: 'end' },
                ]}
              />
            )}
          </Section>
        </>
      ) : null}
    </>
  );
}
