'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { DataTable, EmptyState, FilterBar, Loading, PageHeader, useFilterParam } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';

interface TicketRow {
  id: string;
  subject: string;
  category: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
}

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((value) => ({ value, label: value.replace('_', ' ') }));

/**
 * tasks-notifications-support/64-help-desk-support-ticketing.md (WO-64.5).
 * One list, two audiences: `support.tickets.view_all` sees the whole
 * queue, everyone else sees only what they raised or were assigned — the
 * API itself scopes this, so the screen needs no separate "queue" view.
 */
export default function SupportTicketsPage() {
  const { can } = useAdminSession();
  const canRaise = can('support.tickets.raise');
  const statusFilter = useFilterParam('status');
  const router = useRouter();

  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    adminFetch<TicketRow[]>('/admin/support/tickets', { query: { status: statusFilter || undefined } })
      .then(setRows)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load tickets'));
  }, [statusFilter]);

  return (
    <>
      <PageHeader
        title="Support"
        description="Tickets you raised or were assigned to you — or, with broader access, the whole queue."
        action={
          canRaise ? (
            <Link href={ROUTES.admin.supportTicketNew} className="btn-primary">
              Raise a ticket
            </Link>
          ) : undefined
        }
      />

      <FilterBar filters={[{ key: 'status', type: 'select', placeholder: 'All statuses', options: STATUS_OPTIONS }]} />

      {error ? <p className="notice notice-error">{error}</p> : null}

      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No tickets here"
          description="Nothing matches this filter yet."
          action={
            canRaise ? (
              <Link href={ROUTES.admin.supportTicketNew} className="btn-primary">
                Raise a ticket
              </Link>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(t) => t.id}
          onRowClick={(t) => router.push(ROUTES.admin.supportTicket(t.id))}
          columns={[
            { header: 'Subject', cell: (t) => t.subject },
            { header: 'Category', cell: (t) => t.category },
            { header: 'Priority', cell: (t) => t.priority },
            { header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
            { header: 'Raised', cell: (t) => formatDateTime(t.createdAt) },
          ]}
        />
      )}
    </>
  );
}
