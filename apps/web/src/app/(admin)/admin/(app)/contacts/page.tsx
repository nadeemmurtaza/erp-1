'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { formatMoney } from '@yaseen/shared';
import { adminFetch, getAccessToken } from '@/lib/admin-client';
import { API_URL, toSearchParams } from '@/lib/api';
import type { PaginatedResponse } from '@/types/api';

const STATUSES = ['LEAD', 'ACTIVE', 'REPEAT', 'DORMANT', 'BLOCKED'] as const;

interface Contact {
  id: string;
  name: string;
  phoneE164: string | null;
  email: string | null;
  city: string | null;
  status: string;
  source: string;
  orderCount: number;
  lifetimeValue: number;
  lastOrderAt: string | null;
  notes: string | null;
  tags: Array<{ tag: { id: string; name: string } }>;
}

interface ContactDetail extends Contact {
  orders: Array<{ id: string; number: string; status: string; grandTotal: number; placedAt: string }>;
  interactions: Array<{
    id: string;
    kind: string;
    body: string;
    occurredAt: string;
    actor: { firstName: string | null } | null;
  }>;
  followUps: Array<{ id: string; note: string; dueAt: string; isDone: boolean }>;
}

const INTERACTION_KINDS = ['CALL', 'WHATSAPP', 'EMAIL', 'SMS', 'VISIT', 'NOTE', 'COMPLAINT'];

/**
 * Customers.
 *
 * Records are built automatically from orders and keyed on the phone number, so
 * the same person ordering as a guest twice is one row here, not two.
 */
export default function AdminContactsPage() {
  const [contacts, setContacts] = useState<PaginatedResponse<Contact> | null>(null);
  const [selected, setSelected] = useState<ContactDetail | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [minOrders, setMinOrders] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filters = {
    q: q || undefined,
    status: status || undefined,
    minOrders: minOrders || undefined,
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      setContacts(
        await adminFetch<PaginatedResponse<Contact>>('/admin/crm/contacts', {
          query: { ...filters, page, pageSize: 20 },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load customers');
    }
    // filters is rebuilt each render; the primitive values are the real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, minOrders, page]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function open(id: string) {
    setError(null);
    try {
      setSelected(await adminFetch<ContactDetail>(`/admin/crm/contacts/${id}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the customer');
    }
  }

  async function logInteraction(contactId: string, kind: string, body: string) {
    setBusy(true);
    try {
      await adminFetch('/admin/crm/interactions', {
        method: 'POST',
        body: { contactId, kind, body },
      });
      await open(contactId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not log that');
    } finally {
      setBusy(false);
    }
  }

  async function scheduleFollowUp(contactId: string) {
    const note = window.prompt('What needs doing?');
    if (!note) return;

    const when = window.prompt('When? (YYYY-MM-DD)', isoInDays(3));
    if (!when) return;

    setBusy(true);
    try {
      await adminFetch('/admin/crm/follow-ups', {
        method: 'POST',
        body: { contactId, note, dueAt: new Date(`${when}T09:00:00`).toISOString() },
      });
      await open(contactId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not schedule that');
    } finally {
      setBusy(false);
    }
  }

  async function addTag(contactId: string) {
    const name = window.prompt('Tag (bridal, wholesale, high value…)');
    if (!name) return;

    await adminFetch(`/admin/crm/contacts/${contactId}/tags`, {
      method: 'POST',
      body: { name },
    });
    await open(contactId);
    await load();
  }

  /**
   * The export needs a bearer token, so it cannot be a plain link — fetch it and
   * hand the browser a blob.
   */
  async function exportCsv() {
    setBusy(true);
    try {
      const response = await fetch(
        `${API_URL}/admin/crm/contacts/export${toSearchParams(filters)}`,
        { headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` } },
      );
      if (!response.ok) throw new Error('Export failed');

      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'yaseen-contacts.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Customers</h1>
          <p className="mt-1 text-sm text-neutral-900/60">
            Built from orders and enquiries, matched on phone number.
          </p>
        </div>
        <button type="button" onClick={() => void exportCsv()} disabled={busy} className="btn-secondary">
          Export this list
        </button>
      </div>

      <div className="card mb-4 flex flex-wrap gap-3 p-3">
        <input
          type="search"
          placeholder="Name, phone or email"
          value={q}
          onChange={(event) => {
            setPage(1);
            setQ(event.target.value);
          }}
          className="field-input max-w-xs"
        />
        <select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value);
          }}
          className="field-input w-auto"
        >
          <option value="">All customers</option>
          {STATUSES.map((option) => (
            <option key={option} value={option}>
              {option.charAt(0) + option.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <select
          value={minOrders}
          onChange={(event) => {
            setPage(1);
            setMinOrders(event.target.value);
          }}
          className="field-input w-auto"
        >
          <option value="">Any number of orders</option>
          <option value="1">Has ordered</option>
          <option value="2">Repeat buyers</option>
          <option value="5">5 or more orders</option>
        </select>
      </div>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50">
                <tr>
                  <Th>Customer</Th>
                  <Th className="text-end">Orders</Th>
                  <Th className="text-end">Lifetime value</Th>
                  <Th>Last order</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white">
                {!contacts ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-neutral-900/50">
                      Loading…
                    </td>
                  </tr>
                ) : contacts.data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-neutral-900/50">
                      No customers match those filters.
                    </td>
                  </tr>
                ) : (
                  contacts.data.map((contact) => (
                    <tr
                      key={contact.id}
                      onClick={() => void open(contact.id)}
                      className={cn(
                        'cursor-pointer hover:bg-neutral-50',
                        selected?.id === contact.id && 'bg-neutral-50',
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-neutral-900">{contact.name}</p>
                        <p className="text-xs text-neutral-900/40">
                          {contact.phoneE164 ?? contact.email ?? '—'}
                          {contact.city ? ` · ${contact.city}` : ''}
                        </p>
                        {contact.tags.length > 0 ? (
                          <p className="mt-1 flex flex-wrap gap-1">
                            {contact.tags.map((link) => (
                              <span
                                key={link.tag.id}
                                className="rounded bg-white px-1.5 py-0.5 text-[10px] text-neutral-900/60"
                              >
                                {link.tag.name}
                              </span>
                            ))}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums text-neutral-900/70">
                        {contact.orderCount}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums text-neutral-900">
                        {formatMoney(contact.lifetimeValue)}
                      </td>
                      <td className="px-4 py-3 text-neutral-900/60">
                        {contact.lastOrderAt
                          ? new Date(contact.lastOrderAt).toLocaleDateString('en-PK')
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {contacts && contacts.meta.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm">
              <button
                type="button"
                className="btn-ghost"
                disabled={!contacts.meta.hasPrevious}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span className="text-neutral-900/60">
                Page {contacts.meta.page} of {contacts.meta.totalPages} ·{' '}
                {contacts.meta.total} customers
              </span>
              <button
                type="button"
                className="btn-ghost"
                disabled={!contacts.meta.hasNext}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>

        <aside className="card h-fit p-4 lg:sticky lg:top-4">
          {!selected ? (
            <p className="py-8 text-center text-sm text-neutral-900/50">
              Choose a customer to see their history.
            </p>
          ) : (
            <ContactDetailPanel
              contact={selected}
              busy={busy}
              onLog={logInteraction}
              onFollowUp={() => void scheduleFollowUp(selected.id)}
              onTag={() => void addTag(selected.id)}
            />
          )}
        </aside>
      </div>
    </>
  );
}

function ContactDetailPanel({
  contact,
  busy,
  onLog,
  onFollowUp,
  onTag,
}: {
  contact: ContactDetail;
  busy: boolean;
  onLog: (contactId: string, kind: string, body: string) => Promise<void>;
  onFollowUp: () => void;
  onTag: () => void;
}) {
  const [kind, setKind] = useState('CALL');
  const [body, setBody] = useState('');

  return (
    <div>
      <h2 className="text-base font-semibold text-neutral-900">{contact.name}</h2>
      <p className="text-sm text-neutral-900/60">
        {contact.phoneE164 ?? contact.email ?? 'No contact details'}
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Metric label="Orders" value={String(contact.orderCount)} />
        <Metric label="Lifetime" value={formatMoney(contact.lifetimeValue)} />
        <Metric
          label="Last"
          value={
            contact.lastOrderAt
              ? new Date(contact.lastOrderAt).toLocaleDateString('en-PK', {
                  day: 'numeric',
                  month: 'short',
                })
              : '—'
          }
        />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onFollowUp} className="btn-secondary text-xs">
          Schedule follow-up
        </button>
        <button type="button" onClick={onTag} className="btn-ghost text-xs">
          Add tag
        </button>
      </div>

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!body.trim()) return;
          await onLog(contact.id, kind, body);
          setBody('');
        }}
        className="mt-4 border-t border-neutral-100 pt-4"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
          Log an interaction
        </h3>
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className="field-input mt-2 py-1.5 text-sm"
        >
          {INTERACTION_KINDS.map((option) => (
            <option key={option} value={option}>
              {option.charAt(0) + option.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={2}
          placeholder="What was said?"
          className="field-input mt-2 text-sm"
        />
        <button type="submit" disabled={busy || !body.trim()} className="btn-primary mt-2 w-full text-sm">
          Save
        </button>
      </form>

      {contact.followUps.filter((task) => !task.isDone).length > 0 ? (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
            Open follow-ups
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {contact.followUps
              .filter((task) => !task.isDone)
              .map((task) => (
                <li key={task.id} className="text-neutral-900/70">
                  {task.note}
                  <span className="ms-2 text-xs text-neutral-900/40">
                    {new Date(task.dueAt).toLocaleDateString('en-PK')}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 border-t border-neutral-100 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/50">Orders</h3>
        {contact.orders.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-900/50">No orders yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {contact.orders.slice(0, 6).map((order) => (
              <li key={order.id} className="flex justify-between gap-2">
                <span className="text-neutral-900/70">{order.number}</span>
                <span className="text-neutral-900">{formatMoney(order.grandTotal)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 border-t border-neutral-100 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/50">Timeline</h3>
        {contact.interactions.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-900/50">Nothing logged yet.</p>
        ) : (
          <ol className="mt-2 space-y-2 text-sm">
            {contact.interactions.map((interaction) => (
              <li key={interaction.id}>
                <p className="text-neutral-900/80">{interaction.body}</p>
                <p className="text-xs text-neutral-900/40">
                  {interaction.kind.toLowerCase()} ·{' '}
                  {new Date(interaction.occurredAt).toLocaleDateString('en-PK')}
                  {interaction.actor?.firstName ? ` · ${interaction.actor.firstName}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-neutral-50 p-2">
      <dt className="text-[10px] uppercase tracking-wide text-neutral-900/40">{label}</dt>
      <dd className="text-sm font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-neutral-900/50',
        className,
      )}
    >
      {children}
    </th>
  );
}

function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
