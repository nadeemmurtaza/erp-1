'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDate } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { DataTable, PageHeader } from '@/components/ui';

interface Review {
  id: string;
  productId: string;
  userId: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  status: 'PENDING' | 'PUBLISHED' | 'REJECTED';
  staffReply: string | null;
  createdAt: string;
}

/** WO-7.5 — every review starts PENDING; a spam target within days if left unmoderated. */
export default function ReviewsAdminPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [status, setStatus] = useState<'PENDING' | 'PUBLISHED' | 'REJECTED' | ''>('PENDING');
  const [busy, setBusy] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const query = status ? `?status=${status}&pageSize=100` : '?pageSize=100';
      const res = await adminFetch<{ data: Review[] }>(`/admin/reviews${query}`);
      setReviews(res.data);
    } catch {
      addToast('Could not load reviews.', 'error');
    } finally {
      setBusy(false);
    }
  }, [status, addToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function moderate(id: string, next: 'PUBLISHED' | 'REJECTED') {
    try {
      await adminFetch(`/admin/reviews/${id}`, {
        method: 'PATCH',
        body: { status: next, staffReply: replyDrafts[id] || undefined },
      });
      addToast(next === 'PUBLISHED' ? 'Review published.' : 'Review rejected.', 'success');
      load();
    } catch {
      addToast('Could not update this review.', 'error');
    }
  }

  return (
    <>
      <PageHeader title="Reviews" description="Moderate customer product reviews before they show." />
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <div className="mb-4 flex gap-2">
        {(['PENDING', 'PUBLISHED', 'REJECTED', ''] as const).map((value) => (
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

      <DataTable<Review>
        rows={reviews}
        loading={busy}
        rowKey={(row) => row.id}
        emptyLabel="No reviews here."
        columns={[
          { header: 'Rating', cell: (row) => '★'.repeat(row.rating) },
          { header: 'Title', cell: (row) => row.title ?? '—' },
          { header: 'Body', cell: (row) => <span className="line-clamp-2 max-w-sm">{row.body ?? '—'}</span> },
          { header: 'Date', cell: (row) => formatDate(row.createdAt), muted: true },
          {
            header: 'Reply',
            cell: (row) => (
              <input
                className="field-input"
                placeholder="Optional staff reply"
                defaultValue={row.staffReply ?? ''}
                onChange={(event) => setReplyDrafts((prev) => ({ ...prev, [row.id]: event.target.value }))}
              />
            ),
          },
          {
            header: 'Actions',
            cell: (row) =>
              row.status === 'PENDING' ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => moderate(row.id, 'PUBLISHED')} className="btn-text text-sm">
                    Publish
                  </button>
                  <button type="button" onClick={() => moderate(row.id, 'REJECTED')} className="btn-text text-sm text-red-700">
                    Reject
                  </button>
                </div>
              ) : (
                <span className="text-sm text-neutral-500">{row.status}</span>
              ),
          },
        ]}
      />
    </>
  );
}
