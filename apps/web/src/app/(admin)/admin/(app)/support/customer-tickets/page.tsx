'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { DataTable, EmptyState, FilterBar, Loading, PageHeader, useFilterParam } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface CustomerTicketRow {
  id: string;
  subject: string;
  category: string;
  contactName: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'AWAITING_CUSTOMER' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
}

const STATUS_OPTIONS = ['OPEN', 'AWAITING_CUSTOMER', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((value) => ({
  value,
  label: value.replace('_', ' '),
}));

/**
 * 148-external-customer-support-portal.md WO-148.4 — the staff queue for
 * tickets raised by customers through the storefront, distinct from doc 64's
 * own internal `SupportTicket` queue at `/admin/support/tickets`: the two are
 * different Prisma models with a different requester (`Contact` here, `User`
 * there), so this is a sibling screen, not a filter tab on that one. The
 * handler permissions (`support.tickets.handle`/`.view_all`/`.reassign`) are
 * doc 64's own, reused unchanged — the API itself scopes the list to what
 * each caller may see.
 */
export default function CustomerSupportTicketsPage() {
  const statusFilter = useFilterParam('status');
  const router = useRouter();

  const [rows, setRows] = useState<CustomerTicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    adminFetch<CustomerTicketRow[]>('/admin/support/customer-tickets', { query: { status: statusFilter || undefined } })
      .then(setRows)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load tickets'));
  }, [statusFilter]);

  return (
    <>
      <PageHeader
        title="Customer tickets"
        description="Support tickets raised by customers through their account — the queue you were assigned, or the whole queue with broader access."
      />

      <FilterBar filters={[{ key: 'status', type: 'select', placeholder: 'All statuses', options: STATUS_OPTIONS }]} />

      {error ? <p className="notice notice-error">{error}</p> : null}

      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No tickets here"
          description={statusFilter ? 'Nothing matches this filter yet.' : 'No customer has raised a ticket yet.'}
        />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(t) => t.id}
          onRowClick={(t) => router.push(ROUTES.admin.supportCustomerTicket(t.id))}
          columns={[
            { header: 'Subject', cell: (t) => t.subject },
            { header: 'Category', cell: (t) => t.category },
            { header: 'Customer', cell: (t) => t.contactName },
            { header: 'Priority', cell: (t) => t.priority },
            { header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
            { header: 'Raised', cell: (t) => formatDateTime(t.createdAt) },
          ]}
        />
      )}
    </>
  );
}
