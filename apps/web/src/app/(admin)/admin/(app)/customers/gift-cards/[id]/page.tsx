'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatDateTime, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { DataTable, Loading, PageHeader } from '@/components/ui';

interface GiftCardTransaction {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  orderId: string | null;
  createdAt: string;
}

interface GiftCardDetail {
  id: string;
  code: string;
  balance: number;
  initialValue: number;
  status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';
  recipientName: string | null;
  recipientEmail: string | null;
  message: string | null;
  expiresAt: string | null;
  transactions: GiftCardTransaction[];
}

export default function GiftCardDetailPage() {
  const params = useParams<{ id: string }>();
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [card, setCard] = useState<GiftCardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await adminFetch<GiftCardDetail>(`/admin/gift-cards/${params.id}`);
      setCard(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this gift card');
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel() {
    setCancelling(true);
    try {
      await adminFetch(`/admin/gift-cards/${params.id}/cancel`, { method: 'PATCH' });
      addToast('Gift card cancelled.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not cancel the gift card', 'error');
    } finally {
      setCancelling(false);
    }
  }

  if (error) return <p role="alert" className="notice notice-error">{error}</p>;
  if (!card) return <Loading />;

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader
        title={card.code}
        description={card.recipientName ? `Issued to ${card.recipientName}` : 'Issued, no recipient on file'}
        action={
          card.status === 'ACTIVE' ? (
            <button type="button" onClick={() => void cancel()} disabled={cancelling} className="btn-danger">
              {cancelling ? 'Cancelling…' : 'Cancel card'}
            </button>
          ) : undefined
        }
      />

      <div className="metric-strip mb-6">
        <div className="metric">
          <span className="field-label">Balance</span>
          <strong>{formatMoney(card.balance)}</strong>
        </div>
        <div className="metric">
          <span className="field-label">Initial value</span>
          <strong>{formatMoney(card.initialValue)}</strong>
        </div>
        <div className="metric">
          <span className="field-label">Status</span>
          <strong>{card.status}</strong>
        </div>
      </div>

      <DataTable
        rows={card.transactions}
        rowKey={(t) => t.id}
        emptyLabel="No activity yet."
        columns={[
          { header: 'When', cell: (t) => formatDateTime(t.createdAt), muted: true },
          { header: 'Reason', cell: (t) => t.reason },
          { header: 'Amount', numeric: true, align: 'end', cell: (t) => formatMoney(t.delta) },
          { header: 'Balance after', numeric: true, align: 'end', cell: (t) => formatMoney(t.balanceAfter), muted: true },
        ]}
      />
    </>
  );
}
