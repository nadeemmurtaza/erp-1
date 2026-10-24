'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { Loading, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';

type TicketStatus = 'OPEN' | 'AWAITING_CUSTOMER' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

interface MessageView {
  id: string;
  authorType: 'CUSTOMER' | 'STAFF';
  authorName: string;
  body: string;
  createdAt: string;
}

interface TicketDetail {
  id: string;
  subject: string;
  category: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: TicketStatus;
  contactName: string;
  assignedToName: string | null;
  orderId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  messages: MessageView[];
}

/** The forward moves each status offers, mirroring `customer-support.service.ts`'s own `ALLOWED_TRANSITIONS` — the server is still the authority; a refused move surfaces as an error here. */
const FORWARD_MOVES: Record<TicketStatus, { to: TicketStatus; label: string }[]> = {
  OPEN: [{ to: 'IN_PROGRESS', label: 'Start work' }],
  IN_PROGRESS: [
    { to: 'AWAITING_CUSTOMER', label: 'Awaiting customer reply' },
    { to: 'RESOLVED', label: 'Mark resolved' },
  ],
  AWAITING_CUSTOMER: [{ to: 'IN_PROGRESS', label: 'Resume' }],
  RESOLVED: [
    { to: 'CLOSED', label: 'Close' },
    { to: 'IN_PROGRESS', label: 'Reopen' },
  ],
  CLOSED: [],
};

/** 148-external-customer-support-portal.md WO-148.4 — the staff side of a customer-raised ticket. */
export default function CustomerSupportTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAdminSession();
  const canReassign = can('support.tickets.reassign');

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    adminFetch<TicketDetail>(`/admin/support/customer-tickets/${id}`)
      .then(setTicket)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this ticket'));
  };

  useEffect(load, [id]);

  const sendReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/support/customer-tickets/${id}/messages`, { method: 'POST', body: { body: reply } });
      setReply('');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not post this reply');
    } finally {
      setBusy(false);
    }
  };

  const assign = async () => {
    if (!assigneeUserId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/support/customer-tickets/${id}/assign`, { method: 'POST', body: { assigneeUserId } });
      setAssigneeUserId('');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not assign this ticket');
    } finally {
      setBusy(false);
    }
  };

  const transition = async (status: TicketStatus) => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/support/customer-tickets/${id}/transition`, { method: 'POST', body: { status } });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change this ticket's status");
    } finally {
      setBusy(false);
    }
  };

  if (!ticket) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading label="Loading ticket" />
    );
  }

  return (
    <>
      <PageHeader
        context={
          <Link href={ROUTES.admin.supportCustomerTickets} className="hover:underline">
            ← Customer tickets
          </Link>
        }
        title={ticket.subject}
        description={`${ticket.category} · ${ticket.priority} · raised by ${ticket.contactName}`}
        action={<StatusBadge status={ticket.status} />}
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <p className="text-sm text-neutral-900/60 mb-6">
        {ticket.assignedToName ? `Assigned to ${ticket.assignedToName}.` : 'Unassigned.'} Raised {formatDateTime(ticket.createdAt)}.
        {ticket.resolvedAt ? ` Resolved ${formatDateTime(ticket.resolvedAt)}.` : ''}
      </p>

      <div className="space-y-3 mb-6">
        {ticket.messages.length === 0 ? (
          <p className="text-sm text-neutral-900/60">No replies yet.</p>
        ) : (
          ticket.messages.map((m) => (
            <div key={m.id} className="card">
              <p className="text-sm font-medium text-neutral-900">{m.authorName}</p>
              <p className="text-xs text-neutral-900/60 mb-2">{formatDateTime(m.createdAt)}</p>
              <p className="whitespace-pre-wrap text-sm text-neutral-900">{m.body}</p>
            </div>
          ))
        )}
      </div>

      {ticket.status !== 'CLOSED' ? (
        <div className="card space-y-3 max-w-lg mb-6">
          <h2 className="font-medium text-neutral-900">Reply</h2>
          <textarea className="field-input w-full" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
          <button className="btn btn-primary" onClick={sendReply} disabled={busy || !reply.trim()}>
            Post reply
          </button>
        </div>
      ) : null}

      {FORWARD_MOVES[ticket.status].length > 0 ? (
        <div className="card space-y-3 max-w-lg mb-6">
          <h2 className="font-medium text-neutral-900">Status</h2>
          <div className="flex flex-wrap gap-2">
            {FORWARD_MOVES[ticket.status].map((move) => (
              <button key={move.to} className="btn btn-secondary" disabled={busy} onClick={() => transition(move.to)}>
                {move.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {canReassign ? (
        <div className="card space-y-3 max-w-lg">
          <h2 className="font-medium text-neutral-900">Assign</h2>
          <p className="text-xs text-neutral-900/60">The assignee must hold support.tickets.handle.</p>
          <input
            className="field-input"
            placeholder="User id"
            value={assigneeUserId}
            onChange={(e) => setAssigneeUserId(e.target.value)}
          />
          <button className="btn btn-secondary" disabled={busy || !assigneeUserId.trim()} onClick={assign}>
            Assign
          </button>
        </div>
      ) : null}
    </>
  );
}
