'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDate, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { downloadCsv } from '@/lib/download-csv';
import { ROUTES } from '@/constants/routes';
import type { PaginatedResponse } from '@/types/api';
import {
  DataTable,
  FilterBar,
  Pagination,
  useFilterPage,
  useFilterParam,
  useSetFilterPage,
} from '@/components/ui';
import { exportFilename } from '@/constants/downloads';

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
  // An analytics report (WO-D.5's top-customers table) can only link
  // "somewhere useful" (the Track D shared acceptance criterion) since
  // customers have no standalone detail route — a contact opens as a
  // selection within this list, so the list itself has to be reachable
  // pre-searched. Now two-way: `q` lives in the URL, so this list is
  // shareable and bookmarkable filtered, not just linkable from one report.
  const [contacts, setContacts] = useState<PaginatedResponse<Contact> | null>(null);
  const [selected, setSelected] = useState<ContactDetail | null>(null);
  const q = useFilterParam('q');
  const status = useFilterParam('status');
  const minOrders = useFilterParam('minOrders');
  const page = useFilterPage();
  const setPage = useSetFilterPage();
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
    // FilterBar debounces the search box before it touches the URL.
    load();
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

  async function exportCsv() {
    setBusy(true);
    try {
      await downloadCsv('/admin/crm/contacts/export', exportFilename('contacts'), filters);
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
        <div className="flex gap-2">
          <Link href={ROUTES.admin.customerInsights} className="btn-secondary">
            Insights
          </Link>
          <Link href={ROUTES.admin.contactsImport} className="btn-secondary">
            Import
          </Link>
          <button type="button" onClick={() => void exportCsv()} disabled={busy} className="btn-secondary">
            Export this list
          </button>
        </div>
      </div>

      <FilterBar
        filters={[
          { key: 'q', type: 'search', placeholder: 'Name, phone or email' },
          {
            key: 'status',
            type: 'select',
            placeholder: 'All customers',
            options: STATUSES.map((option) => ({
              value: option,
              label: option.charAt(0) + option.slice(1).toLowerCase(),
            })),
          },
          {
            key: 'minOrders',
            type: 'select',
            placeholder: 'Any number of orders',
            options: [
              { value: '1', label: 'Has ordered' },
              { value: '2', label: 'Repeat buyers' },
              { value: '5', label: '5 or more orders' },
            ],
          },
        ]}
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="overflow-hidden">
          <DataTable
            rows={contacts?.data ?? null}
            loading={!contacts}
            emptyLabel="No customers match those filters."
            rowKey={(contact) => contact.id}
            onRowClick={(contact) => void open(contact.id)}
            isRowSelected={(contact) => selected?.id === contact.id}
            columns={[
              {
                header: 'Customer',
                cell: (contact) => (
                  <>
                    <p className="font-medium text-neutral-900">{contact.name}</p>
                    <p className="text-xs text-neutral-900/60">
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
                  </>
                ),
              },
              {
                header: 'Orders',
                align: 'end',
                numeric: true,
                cell: (contact) => contact.orderCount,
                muted: true,
              },
              {
                header: 'Lifetime value',
                align: 'end',
                numeric: true,
                cell: (contact) => formatMoney(contact.lifetimeValue),
              },
              {
                header: 'Last order',
                cell: (contact) => (contact.lastOrderAt ? formatDate(contact.lastOrderAt) : '—'),
                muted: true,
              },
            ]}
          />

          {contacts ? <Pagination meta={contacts.meta} onChange={setPage} itemLabel="customers" /> : null}
        </div>

        <aside className="card h-fit p-4 lg:sticky lg:top-4">
          {!selected ? (
            <p className="py-8 text-center text-sm text-neutral-900/60">
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
              ? formatDate(contact.lastOrderAt)
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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60">
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
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60">
            Open follow-ups
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {contact.followUps
              .filter((task) => !task.isDone)
              .map((task) => (
                <li key={task.id} className="text-neutral-900/70">
                  {task.note}
                  <span className="ms-2 text-xs text-neutral-900/60">
                    {formatDate(task.dueAt)}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 border-t border-neutral-100 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60">Orders</h3>
        {contact.orders.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-900/60">No orders yet.</p>
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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60">Timeline</h3>
        {contact.interactions.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-900/60">Nothing logged yet.</p>
        ) : (
          <ol className="mt-2 space-y-2 text-sm">
            {contact.interactions.map((interaction) => (
              <li key={interaction.id}>
                <p className="text-neutral-900/80">{interaction.body}</p>
                <p className="text-xs text-neutral-900/60">
                  {interaction.kind.toLowerCase()} ·{' '}
                  {formatDate(interaction.occurredAt)}
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
      <dt className="text-[10px] uppercase tracking-wide text-neutral-900/60">{label}</dt>
      <dd className="text-sm font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}

function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
