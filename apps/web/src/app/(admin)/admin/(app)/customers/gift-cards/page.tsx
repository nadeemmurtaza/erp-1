'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { DataTable, PageHeader } from '@/components/ui';

interface GiftCard {
  id: string;
  maskedCode: string;
  balance: number;
  initialValue: number;
  status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';
  recipientName: string | null;
  expiresAt: string | null;
  issuedAt: string;
}

const STATUS_LABEL: Record<GiftCard['status'], string> = {
  ACTIVE: 'Active',
  REDEEMED: 'Fully redeemed',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

/** Gift cards — real money in hand. Issue, view, and cancel; the ledger lives on each card's own page. */
export default function GiftCardsPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [cards, setCards] = useState<GiftCard[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [issuing, setIssuing] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: GiftCard[] }>('/admin/gift-cards?pageSize=100');
      setCards(res.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load gift cards');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function issue(event: React.FormEvent) {
    event.preventDefault();
    setIssuing(true);
    try {
      await adminFetch('/admin/gift-cards', {
        method: 'POST',
        body: {
          initialValue: Math.round(Number(amount) * 100),
          recipientName: recipientName.trim() || undefined,
          recipientEmail: recipientEmail.trim() || undefined,
        },
      });
      setAmount('');
      setRecipientName('');
      setRecipientEmail('');
      addToast('Gift card issued.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not issue the gift card', 'error');
    } finally {
      setIssuing(false);
    }
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader title="Gift cards" description="Issue a card, and see every one that's been sold or given out." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <form onSubmit={issue} className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="field-label">Amount (Rs)</span>
          <input type="number" min={1} step="1" className="field-input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="block">
          <span className="field-label">Recipient name (optional)</span>
          <input className="field-input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Recipient email (optional)</span>
          <input type="email" className="field-input" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
        </label>
        <button type="submit" disabled={issuing} className="btn-primary">
          {issuing ? 'Issuing…' : 'Issue gift card'}
        </button>
      </form>

      <DataTable
        rows={cards}
        loading={busy && !cards}
        rowKey={(c) => c.id}
        emptyLabel="No gift cards yet."
        columns={[
          { header: 'Code', cell: (c) => <Link href={`/admin/customers/gift-cards/${c.id}`} className="font-mono text-xs hover:underline">{c.maskedCode}</Link> },
          { header: 'Recipient', cell: (c) => c.recipientName ?? '—', muted: true },
          { header: 'Balance', numeric: true, align: 'end', cell: (c) => formatMoney(c.balance) },
          { header: 'Initial value', numeric: true, align: 'end', cell: (c) => formatMoney(c.initialValue), muted: true },
          { header: 'Issued', cell: (c) => formatDate(c.issuedAt), muted: true },
          { header: 'Status', cell: (c) => STATUS_LABEL[c.status] },
        ]}
      />
    </>
  );
}
