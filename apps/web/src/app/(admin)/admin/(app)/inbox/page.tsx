'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';
import type { InboundEmail, PaginatedResponse } from '@/types/api';
import { formatDateTime } from '@newax/shared';

import { Loading } from '@/components/ui';
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

  async function reply(id: string, text: string) {
    const updated = await adminFetch<InboundEmail>(`/admin/crm/inbox/${id}/reply`, {
      method: 'POST',
      body: { text },
    });
    setSelected(updated);
    await load();
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Support Inbox</h1>
        <p className="mt-1 text-sm text-neutral-900/60">
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
            className={cn(
              'rounded-md px-3 py-1.5 text-sm capitalize',
              filter === option ? 'bg-accent-hover text-white' : 'text-neutral-900/60 hover:bg-neutral-50',
            )}
          >
            {option === 'unlinked' ? 'Needs linking' : option}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_28rem]">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50">
                <tr>
                  <Th>From</Th>
                  <Th>Subject</Th>
                  <Th>Mailbox</Th>
                  <Th>Received</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white">
                {!messages ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center">
                    <Loading className="p-0" />
                  </td>
                  </tr>
                ) : messages.data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-neutral-900/50">
                      Nothing here.
                    </td>
                  </tr>
                ) : (
                  messages.data.map((message) => (
                    <tr
                      key={message.id}
                      onClick={() => void open(message.id)}
                      className={cn(
                        'cursor-pointer hover:bg-neutral-50',
                        selected?.id === message.id && 'bg-neutral-50',
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-neutral-900">{message.fromName || message.fromAddress}</p>
                        <p className="text-xs text-neutral-900/40">{message.fromAddress}</p>
                      </td>
                      <td className="px-4 py-3 text-neutral-900/80">
                        {message.subject || '(no subject)'}
                        {message._count.replies > 0 ? (
                          <span className="ms-2 rounded bg-neutral-50 px-2 py-0.5 text-xs font-medium text-accent-hover">
                            Replied
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-neutral-900/60">{message.emailAccount.label}</td>
                      <td className="px-4 py-3 text-neutral-900/60">
                        {formatDateTime(message.receivedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {messages && messages.meta.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm">
              <button
                type="button"
                className="btn-ghost"
                disabled={!messages.meta.hasPrevious}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span className="text-neutral-900/60">
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
            <p className="py-8 text-center text-sm text-neutral-900/50">Choose a message to read it.</p>
          ) : (
            <MessageDetailPanel message={selected} onLink={link} onReply={reply} />
          )}
        </aside>
      </div>
    </>
  );
}

function MessageDetailPanel({
  message,
  onLink,
  onReply,
}: {
  message: InboundEmail;
  onLink: (id: string, contactId: string) => Promise<void>;
  onReply: (id: string, text: string) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    setQ('');
    setOptions([]);
    setDraft('');
    setSendError(null);
  }, [message.id]);

  async function submitReply() {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setSendError(null);
    try {
      await onReply(message.id, text);
      setDraft('');
    } catch (cause) {
      setSendError(cause instanceof Error ? cause.message : 'Could not send that reply');
    } finally {
      setSending(false);
    }
  }

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
      <h2 className="text-base font-semibold text-neutral-900">{message.subject || '(no subject)'}</h2>
      <p className="mt-1 text-sm text-neutral-900/60">
        {message.fromName ? `${message.fromName} · ` : ''}
        {message.fromAddress}
      </p>
      <p className="text-xs text-neutral-900/40">
        {formatDateTime(message.receivedAt)} · via {message.emailAccount.label}
      </p>

      <div className="mt-4 whitespace-pre-wrap rounded-md bg-neutral-50 p-3 text-sm text-neutral-900/80">
        {message.bodyText || '(no text body)'}
      </div>

      {message.replies && message.replies.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {message.replies.map((reply) => (
            <li key={reply.id} className="rounded-md border border-neutral-100 bg-neutral-50/50 p-3">
              <p className="text-xs font-medium text-neutral-900/60">
                {reply.actor ? `${reply.actor.firstName ?? ''} ${reply.actor.lastName ?? ''}`.trim() || 'Staff' : 'Staff'}
                {' · '}
                {formatDateTime(reply.sentAt)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-900/80">{reply.body}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 border-t border-neutral-100 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/50">Reply</h3>
        <textarea
          rows={4}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Reply to ${message.fromName || message.fromAddress}…`}
          className="field-input mt-2 text-sm"
        />
        {sendError ? <p className="mt-1 text-xs text-red-700">{sendError}</p> : null}
        <button
          type="button"
          onClick={() => void submitReply()}
          disabled={sending || !draft.trim()}
          className="btn-primary mt-2 disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send reply'}
        </button>
      </div>

      <div className="mt-4 border-t border-neutral-100 pt-4">
        {message.contact ? (
          <p className="text-sm text-neutral-900/70">
            Linked to <span className="font-medium text-neutral-900">{message.contact.name}</span>
            {message.contact.phoneE164 ? ` · ${message.contact.phoneE164}` : ''}
          </p>
        ) : (
          <>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
              Link to a customer
            </h3>
            <input
              type="search"
              placeholder="Name, phone or email"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              className="field-input mt-2 text-sm"
            />
            {searching ? <p className="mt-2 text-xs text-neutral-900/40">Searching…</p> : null}
            {options.length > 0 ? (
              <ul className="mt-2 divide-y divide-white rounded-md border border-neutral-100">
                {options.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => void onLink(message.id, option.id)}
                      className="block w-full px-3 py-2 text-start text-sm hover:bg-neutral-50"
                    >
                      <span className="font-medium text-neutral-900">{option.name}</span>
                      <span className="ms-2 text-neutral-900/40">
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
      className="px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-neutral-900/50"
    >
      {children}
    </th>
  );
}
