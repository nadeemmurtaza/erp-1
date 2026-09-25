'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDate } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { DataTable, PageHeader } from '@/components/ui';

interface ReturnRequest {
  id: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'REFUNDED';
  reasonCode: string;
  note: string | null;
  createdAt: string;
  order: { number: string };
  user: { email: string | null; phone: string | null; firstName: string | null };
}

/**
 * WO-7.3 — a decision, not a refund. Approving does not move money or stock;
 * finish the refund via Payments and restock via Inventory as usual, then
 * mark refunded here so the customer sees it close out.
 */
export default function ReturnsAdminPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [requests, setRequests] = useState<ReturnRequest[] | null>(null);
  const [status, setStatus] = useState<ReturnRequest['status'] | ''>('REQUESTED');
  const [busy, setBusy] = useState(true);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const query = status ? `?status=${status}&pageSize=100` : '?pageSize=100';
      const res = await adminFetch<{ data: ReturnRequest[] }>(`/admin/returns${query}`);
      setRequests(res.data);
    } catch {
      addToast('Could not load return requests.', 'error');
    } finally {
      setBusy(false);
    }
  }, [status, addToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    const decisionNote = decisionNotes[id]?.trim();
    if (!decisionNote) {
      addToast('A note is required — the customer sees it.', 'error');
      return;
    }
    try {
      await adminFetch(`/admin/returns/${id}/decide`, { method: 'PATCH', body: { decision, decisionNote } });
      addToast(decision === 'APPROVED' ? 'Return approved.' : 'Return rejected.', 'success');
      load();
    } catch {
      addToast('Could not update this return.', 'error');
    }
  }

  async function markRefunded(id: string) {
    try {
      await adminFetch(`/admin/returns/${id}/mark-refunded`, { method: 'POST' });
      addToast('Marked refunded.', 'success');
      load();
    } catch {
      addToast('Could not mark this refunded.', 'error');
    }
  }

  return (
    <>
      <PageHeader
        title="Returns"
        description="Customer self-service return requests. Approving does not refund automatically — finish that through Payments, then mark refunded here."
      />
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <div className="mb-4 flex gap-2">
        {(['REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED', ''] as const).map((value) => (
          <button
            key={value || 'all'}
            type="button"
            onClick={() => setStatus(value)}
            className={status === value ? 'chip bg-accent text-white' : 'chip'}
          >
            {value || 'All'}
          </button>
        ))}
      </div>

      <DataTable<ReturnRequest>
        rows={requests}
        loading={busy}
        rowKey={(row) => row.id}
        emptyLabel="No return requests here."
        columns={[
          { header: 'Order', cell: (row) => row.order.number },
          { header: 'Customer', cell: (row) => row.user.firstName ?? row.user.email ?? row.user.phone ?? '—' },
          { header: 'Reason', cell: (row) => row.reasonCode },
          { header: 'Note', cell: (row) => <span className="line-clamp-2 max-w-xs">{row.note ?? '—'}</span> },
          { header: 'Date', cell: (row) => formatDate(row.createdAt), muted: true },
          {
            header: 'Decision',
            cell: (row) =>
              row.status === 'REQUESTED' ? (
                <div className="flex flex-col gap-2">
                  <input
                    className="field-input"
                    placeholder="Note shown to the customer"
                    onChange={(event) => setDecisionNotes((prev) => ({ ...prev, [row.id]: event.target.value }))}
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => decide(row.id, 'APPROVED')} className="btn-text text-sm">
                      Approve
                    </button>
                    <button type="button" onClick={() => decide(row.id, 'REJECTED')} className="btn-text text-sm text-red-700">
                      Reject
                    </button>
                  </div>
                </div>
              ) : row.status === 'APPROVED' ? (
                <button type="button" onClick={() => markRefunded(row.id)} className="btn-text text-sm">
                  Mark refunded
                </button>
              ) : (
                <span className="text-sm text-neutral-500">{row.status}</span>
              ),
          },
        ]}
      />
    </>
  );
}
