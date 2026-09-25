'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney, formatDate } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { DataTable, EmptyState, FilterBar, PageHeader, useFilterParam } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface DebitNoteRow {
  id: string;
  number: string;
  supplierId: string;
  amountMinor: number;
  reason: string;
  status: 'DRAFT' | 'ISSUED' | 'APPLIED' | 'VOID';
  createdAt: string;
}

const STATUS_OPTIONS = ['DRAFT', 'ISSUED', 'VOID'].map((value) => ({ value, label: value }));

export default function DebitNotesPage() {
  const [rows, setRows] = useState<DebitNoteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const statusFilter = useFilterParam('status');

  useEffect(() => {
    setBusy(true);
    setError(null);
    adminFetch<{ data: DebitNoteRow[] }>('/admin/debit-notes', { query: { status: statusFilter || undefined } })
      .then((res) => setRows(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load debit notes'))
      .finally(() => setBusy(false));
  }, [statusFilter]);

  return (
    <>
      <PageHeader
        title="Debit Notes"
        description="Reduces what this organization owes a supplier — a return, an overcharge correction."
        action={
          <Link href={ROUTES.admin.debitNoteNew} className="btn-primary">
            New debit note
          </Link>
        }
      />

      <FilterBar filters={[{ key: 'status', type: 'select', placeholder: 'All statuses', options: STATUS_OPTIONS }]} />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        {rows && rows.length === 0 ? (
          <EmptyState
            title="No debit notes"
            description="Nothing has been issued yet, or none match this filter."
            action={
              <Link href={ROUTES.admin.debitNoteNew} className="btn-primary">
                New debit note
              </Link>
            }
          />
        ) : (
          <DataTable
            rows={rows}
            loading={busy && !rows}
            emptyLabel="No debit notes found."
            rowKey={(r) => r.id}
            columns={[
              {
                header: 'Number',
                cell: (r) => (
                  <Link href={ROUTES.admin.debitNote(r.id)} className="font-medium text-accent-hover hover:underline">
                    {r.number}
                  </Link>
                ),
              },
              { header: 'Reason', cell: (r) => r.reason, muted: true },
              { header: 'Amount', align: 'end', numeric: true, cell: (r) => formatMoney(r.amountMinor) },
              { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
              { header: 'Date', cell: (r) => formatDate(r.createdAt), muted: true },
            ]}
          />
        )}
      </div>
    </>
  );
}
