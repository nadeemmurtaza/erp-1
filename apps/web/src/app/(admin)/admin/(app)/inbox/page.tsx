'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { adminFetch } from '@/lib/admin-client';
import type { InboundEmail, PaginatedResponse } from '@/lib/api-types';

type LinkFilter = 'all' | 'unlinked' | 'linked';

interface ContactOption {
  id: string;
  name: string;
  phoneE164: string | null;
  email: string | null;
}

/**
 * Support Inbox.
 *
 * Messages the mailbox poller pulled from a connected mailbox (Email Accounts
 * screen) — replies to order or support mail. Ones from a recognised
 * customer are linked automatically and already sit on that customer's
 * Timeline; the rest wait here for staff to link by hand or dismiss as noise.
 */
export default function AdminInboxPage() {
  const [messages, setMessages] = useState<PaginatedResponse<InboundEmail> | null>(null);
  const [filter, setFilter] = useState<LinkFilter>('unlinked');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<InboundEmail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const linked = filter === 'all' ? undefined : filter === 'linked';
      setMessages(
        await adminFetch<PaginatedResponse<InboundEmail>>('/admin/crm/inbox', {
          query: { linked, page, pageSize: 20 },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the inbox');
    }
  }, [filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: string) {
    setError(null);
    try {
      setSelected(await adminFetch<InboundEmail>(`/admin/crm/inbox/${id}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open that message');
    }
  }

  async function link(id: string, contactId: string) {
    setError(null);
    try {
      const updated = await adminFetch<InboundEmail>(`/admin/crm/inbox/${id}/link`, {
        method: 'POST',
        body: { contactId },
      });
      setSelected(updated);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not link that message');
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Support Inbox</h1>
        <p className="mt-1 text-sm text-ink/60">
          Replies pulled from a connected mailbox. Recognised customers are linked
          automatically — the rest are waiting for you.
        </p>
      </div>

      <div className="card mb-4 flex gap-2 p-3">
        {(['unlinked', 'linked', 'all'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setPage(1);
              setFilter(option);
            }}
            className={clsx(
              'rounded-md px-3 py-1.5 text-sm capitalize',
              filter === option ? 'bg-brand-600 text-white' : 'text-ink/60 hover:bg-sand-50',
            )}
          >
            {option === 'unlinked' ? 'Needs linking' : option}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_28rem]">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-sand-200 bg-sand-50">
                <tr>
                  <Th>From</Th>
                  <Th>Subject</Th>
                  <Th>Mailbox</Th>
                  <Th>Received</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {!messages ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-ink/50">
                      Loading…
                    </td>
                  </tr>
                ) : messages.data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-ink/50">
                      Nothing here.
                    </td>
                  </tr>
                ) : (
                  messages.data.map((message) => (
                    <tr
                      key={message.id}
                      onClick={() => void open(message.id)}
                      className={clsx(
                        'cursor-pointer hover:bg-sand-50',
                        selected?.id === message.id && 'bg-brand-50',
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{message.fromName || message.fromAddress}</p>
                        <p className="text-xs text-ink/40">{message.fromAddress}</p>
                      </td>
                      <td className="px-4 py-3 text-ink/80">{message.subject || '(no subject)'}</td>
                      <td className="px-4 py-3 text-ink/60">{message.emailAccount.label}</td>
                      <td className="px-4 py-3 text-ink/60">
                        {new Date(message.receivedAt).toLocaleString('en-PK')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {messages && messages.meta.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-sand-200 px-4 py-3 text-sm">
              <button
                type="button"
                className="btn-ghost"
                disabled={!messages.meta.hasPrevious}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span className="text-ink/60">
                Page {messages.meta.page} of {messages.meta.totalPages} · {messages.meta.total} messages
              </span>
              <button
                type="button"
                className="btn-ghost"
                disabled={!messages.meta.hasNext}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>

        <aside className="card h-fit p-4 lg:sticky lg:top-4">
          {!selected ? (
            <p className="py-8 text-center text-sm text-ink/50">Choose a message to read it.</p>
          ) : (
            <MessageDetailPanel message={selected} onLink={link} />
          )}
        </aside>
      </div>
    </>
  );
}

function MessageDetailPanel({
  message,
  onLink,
}: {
  message: InboundEmail;
  onLink: (id: string, contactId: string) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setQ('');
    setOptions([]);
  }, [message.id]);

  useEffect(() => {
    if (message.contact || !q.trim()) {
      setOptions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await adminFetch<{ data: ContactOption[] }>('/admin/crm/contacts', {
          query: { q, pageSize: 5 },
        });
        setOptions(result.data);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, message.contact]);

  return (
    <div>
      <h2 className="text-base font-semibold text-ink">{message.subject || '(no subject)'}</h2>
      <p className="mt-1 text-sm text-ink/60">
        {message.fromName ? `${message.fromName} · ` : ''}
        {message.fromAddress}
      </p>
      <p className="text-xs text-ink/40">
        {new Date(message.receivedAt).toLocaleString('en-PK')} · via {message.emailAccount.label}
      </p>

      <div className="mt-4 whitespace-pre-wrap rounded-md bg-sand-50 p-3 text-sm text-ink/80">
        {message.bodyText || '(no text body)'}
      </div>

      <div className="mt-4 border-t border-sand-200 pt-4">
        {message.contact ? (
          <p className="text-sm text-ink/70">
            Linked to <span className="font-medium text-ink">{message.contact.name}</span>
            {message.contact.phoneE164 ? ` · ${message.contact.phoneE164}` : ''}
          </p>
        ) : (
          <>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              Link to a customer
            </h3>
            <input
              type="search"
              placeholder="Name, phone or email"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              className="field-input mt-2 text-sm"
            />
            {searching ? <p className="mt-2 text-xs text-ink/40">Searching…</p> : null}
            {options.length > 0 ? (
              <ul className="mt-2 divide-y divide-sand-100 rounded-md border border-sand-200">
                {options.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => void onLink(message.id, option.id)}
                      className="block w-full px-3 py-2 text-start text-sm hover:bg-sand-50"
                    >
                      <span className="font-medium text-ink">{option.name}</span>
                      <span className="ms-2 text-ink/40">
                        {option.phoneE164 ?? option.email ?? ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-ink/50"
    >
      {children}
    </th>
  );
}
