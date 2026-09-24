'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatDateTime, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { DataTable, PageHeader } from '@/components/ui';

interface StoreCreditTransaction {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  orderId: string | null;
  note: string | null;
  createdAt: string;
}

interface StoreCreditLedger {
  balance: number;
  data: StoreCreditTransaction[];
}

/**
 * The customer record — today, only what WO-5.5 needs: store-credit balance
 * and ledger. Nothing else about a customer has a record page yet (no CRM
 * profile screen exists in this codebase), so this page is deliberately
 * narrow rather than a stand-in for one; a fuller profile is its own,
 * separate work when a real requirement asks for it.
 */
export default function CustomerRecordPage() {
  const params = useParams<{ id: string }>();
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [ledger, setLedger] = useState<StoreCreditLedger | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [issuing, setIssuing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await adminFetch<StoreCreditLedger>(`/admin/customers/${params.id}/store-credit?pageSize=50`);
      setLedger(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this customer');
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function issueGoodwill(event: React.FormEvent) {
    event.preventDefault();
    setIssuing(true);
    try {
      await adminFetch(`/admin/customers/${params.id}/store-credit`, {
        method: 'POST',
        body: { amount: Math.round(Number(amount) * 100), reason: 'goodwill', note: note.trim() || undefined },
      });
      setAmount('');
      setNote('');
      addToast('Store credit issued.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not issue store credit', 'error');
    } finally {
      setIssuing(false);
    }
  }

  if (error) return <p role="alert" className="notice notice-error">{error}</p>;

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader title="Store credit" description="Refunds, RTO goodwill and service recovery all land here." />

      <div className="metric-strip mb-6">
        <div className="metric">
          <span className="field-label">Balance</span>
          <strong>{ledger ? formatMoney(ledger.balance) : '—'}</strong>
        </div>
      </div>

      <form onSubmit={issueGoodwill} className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="field-label">Issue goodwill credit (Rs)</span>
          <input type="number" min={1} step="1" className="field-input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="block">
          <span className="field-label">Note (optional)</span>
          <input className="field-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delayed delivery apology" />
        </label>
        <button type="submit" disabled={issuing} className="btn-primary">
          {issuing ? 'Issuing…' : 'Issue credit'}
        </button>
      </form>

      <DataTable
        rows={ledger?.data ?? null}
        rowKey={(t) => t.id}
        emptyLabel="No store credit activity yet."
        columns={[
          { header: 'When', cell: (t) => formatDateTime(t.createdAt), muted: true },
          { header: 'Reason', cell: (t) => t.reason },
          { header: 'Note', cell: (t) => t.note ?? '—', muted: true },
          { header: 'Amount', numeric: true, align: 'end', cell: (t) => formatMoney(t.delta) },
          { header: 'Balance after', numeric: true, align: 'end', cell: (t) => formatMoney(t.balanceAfter), muted: true },
        ]}
      />
    </>
  );
}
