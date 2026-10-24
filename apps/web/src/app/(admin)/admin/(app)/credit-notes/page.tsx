'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney, formatDate } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { DataTable, EmptyState, FilterBar, PageHeader, useFilterParam } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface CreditNoteRow {
  id: string;
  number: string;
  customerId: string;
  amountMinor: number;
  reason: string;
  status: 'DRAFT' | 'ISSUED' | 'APPLIED' | 'VOID';
  createdAt: string;
}

const STATUS_OPTIONS = ['DRAFT', 'ISSUED', 'APPLIED', 'VOID'].map((value) => ({ value, label: value }));

export default function CreditNotesPage() {
  const [rows, setRows] = useState<CreditNoteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const statusFilter = useFilterParam('status');

  useEffect(() => {
    setBusy(true);
    setError(null);
    adminFetch<{ data: CreditNoteRow[] }>('/admin/credit-notes', { query: { status: statusFilter || undefined } })
      .then((res) => setRows(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load credit notes'))
      .finally(() => setBusy(false));
  }, [statusFilter]);

  return (
    <>
      <PageHeader
        title="Credit Notes"
        description="Reduces what a customer owes — a return, a pricing correction, a goodwill credit."
        action={
          <Link href={ROUTES.admin.creditNoteNew} className="btn-primary">
            New credit note
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
            title="No credit notes"
            description="Nothing has been issued yet, or none match this filter."
            action={
              <Link href={ROUTES.admin.creditNoteNew} className="btn-primary">
                New credit note
              </Link>
            }
          />
        ) : (
          <DataTable
            rows={rows}
            loading={busy && !rows}
            emptyLabel="No credit notes found."
            rowKey={(r) => r.id}
            columns={[
              {
                header: 'Number',
                cell: (r) => (
                  <Link href={ROUTES.admin.creditNote(r.id)} className="font-medium text-accent-hover hover:underline">
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
