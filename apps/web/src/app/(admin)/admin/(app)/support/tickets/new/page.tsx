'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import { Loading, PageHeader } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

/** tasks-notifications-support/64-help-desk-support-ticketing.md WO-64.5. */
export default function NewSupportTicketPage() {
  const router = useRouter();
  const { can } = useAdminSession();
  const canRaise = can('support.tickets.raise');

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('NORMAL');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backLink = (
    <Link href={ROUTES.admin.supportTickets} className="hover:underline">
      ← Support
    </Link>
  );

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const ticket = await adminFetch<{ id: string }>('/admin/support/tickets', {
        method: 'POST',
        body: { subject, category, priority },
      });
      router.push(ROUTES.admin.supportTicket(ticket.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not raise this ticket');
      setBusy(false);
    }
  };

  if (!canRaise) {
    return (
      <>
        <PageHeader title="Raise a ticket" context={backLink} />
        <p className="notice">You do not hold the permission needed to raise a support ticket.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Raise a ticket" description="Whoever handles support tickets is notified right away." context={backLink} />

      <div className="card space-y-4 max-w-lg">
        <div>
          <label className="field-label" htmlFor="subject">Subject</label>
          <input id="subject" className="field-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="category">Category</label>
          <input id="category" className="field-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. IT, Access, Payroll" />
        </div>
        <div>
          <label className="field-label" htmlFor="priority">Priority</label>
          <select id="priority" className="field-input" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {error ? <p className="notice notice-error">{error}</p> : null}

        <button className="btn btn-primary" onClick={submit} disabled={busy || !subject.trim() || !category.trim()}>
          {busy ? <Loading /> : 'Raise ticket'}
        </button>
      </div>
    </>
  );
}
