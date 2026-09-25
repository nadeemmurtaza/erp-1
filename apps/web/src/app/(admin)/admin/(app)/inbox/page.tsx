'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';
import type { InboundEmail, PaginatedResponse, WhatsAppConversation } from '@/types/api';
import { formatDateTime } from '@newax/shared';

import {
  DataTable,
  FilterBar,
  Pagination,
  useFilterPage,
  useFilterParam,
  useSetFilterPage,
  useSetFilterParam,
} from '@/components/ui';

type Channel = 'email' | 'whatsapp';
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
 * One screen for every channel a customer can message this shop on, because
 * "triage what a customer sent us" is one job whichever channel it arrived
 * on (Law 5) — a second nav entry for WhatsApp would only make the product
 * look bigger than it is (Law 3). Email is the mailbox poller's own
 * messages; WhatsApp is WO-9.7's assistant conversations, most of them
 * already answered automatically and waiting here only if the assistant
 * handed them off.
 */
export default function AdminInboxPage() {
  const channel = (useFilterParam('channel', 'email') as Channel) ?? 'email';
  const setChannel = useSetFilterParam('channel');

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Support Inbox</h1>
        <p className="mt-1 text-sm text-neutral-900/60">
          {channel === 'email'
            ? 'Replies pulled from a connected mailbox. Recognised customers are linked automatically — the rest are waiting for you.'
            : 'WhatsApp conversations the assistant could not answer safely, or where a customer asked for a person.'}
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        {(['email', 'whatsapp'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setChannel(option === 'email' ? null : option)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm capitalize',
              channel === option ? 'bg-accent-hover text-white' : 'text-neutral-900/60 hover:bg-neutral-50',
            )}
          >
            {option === 'email' ? 'Email' : 'WhatsApp'}
          </button>
        ))}
      </div>

      {channel === 'whatsapp' ? <WhatsAppInboxView /> : <EmailInboxView />}
    </>
  );
}

function EmailInboxView() {
  const [messages, setMessages] = useState<PaginatedResponse<InboundEmail> | null>(null);
  const [busy, setBusy] = useState(true);
  const filter = useFilterParam('filter', 'unlinked') as LinkFilter;
  const setFilterParam = useSetFilterParam('filter');
  const page = useFilterPage();
  const setPage = useSetFilterPage();
  const [selected, setSelected] = useState<InboundEmail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
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
    } finally {
      setBusy(false);
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
      <FilterBar
        filters={[]}
        trailing={
          <div className="flex gap-2">
            {(['unlinked', 'linked', 'all'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilterParam(option === 'unlinked' ? null : option)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm capitalize',
                  filter === option ? 'bg-accent-hover text-white' : 'text-neutral-900/60 hover:bg-neutral-50',
                )}
              >
                {option === 'unlinked' ? 'Needs linking' : option}
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_28rem]">
        <div className="overflow-hidden">
          <DataTable
            rows={messages?.data}
            loading={busy && !messages}
            emptyLabel="Nothing here."
            rowKey={(message) => message.id}
            onRowClick={(message) => void open(message.id)}
            isRowSelected={(message) => selected?.id === message.id}
            columns={[
              {
                header: 'From',
                cell: (message) => (
                  <>
                    <p className="font-medium text-neutral-900">{message.fromName || message.fromAddress}</p>
                    <p className="text-xs text-neutral-900/60">{message.fromAddress}</p>
                  </>
                ),
              },
              {
                header: 'Subject',
                cell: (message) => (
                  <>
                    {message.subject || '(no subject)'}
                    {message._count.replies > 0 ? (
                      <span className="ms-2 rounded bg-neutral-50 px-2 py-0.5 text-xs font-medium text-accent-hover">
                        Replied
                      </span>
                    ) : null}
                  </>
                ),
              },
              {
                header: 'Mailbox',
                muted: true,
                cell: (message) => message.emailAccount.label,
              },
              {
                header: 'Received',
                muted: true,
                cell: (message) => formatDateTime(message.receivedAt),
              },
            ]}
          />

          {messages ? <Pagination meta={messages.meta} onChange={setPage} itemLabel="messages" /> : null}
        </div>

        <aside className="card h-fit p-4 lg:sticky lg:top-4">
          {!selected ? (
            <p className="py-8 text-center text-sm text-neutral-900/60">Choose a message to read it.</p>
          ) : (
            <EmailDetailPanel message={selected} onLink={link} onReply={reply} />
          )}
        </aside>
      </div>
    </>
  );
}

function EmailDetailPanel({
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
      <p className="text-xs text-neutral-900/60">
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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60">Reply</h3>
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
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60">
              Link to a customer
            </h3>
            <input
              type="search"
              placeholder="Name, phone or email"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              className="field-input mt-2 text-sm"
            />
            {searching ? <p className="mt-2 text-xs text-neutral-900/60">Searching…</p> : null}
            {options.length > 0 ? (
              <ul className="mt-2 divide-y divide-neutral-100 rounded-md border border-neutral-100">
                {options.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => void onLink(message.id, option.id)}
                      className="block w-full px-3 py-2 text-start text-sm hover:bg-neutral-50"
                    >
                      <span className="font-medium text-neutral-900">{option.name}</span>
                      <span className="ms-2 text-neutral-900/60">
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

type HandoffFilter = 'waiting' | 'all';

function WhatsAppInboxView() {
  const [conversations, setConversations] = useState<PaginatedResponse<WhatsAppConversation> | null>(null);
  const [busy, setBusy] = useState(true);
  const filter = (useFilterParam('handoff', 'waiting') as HandoffFilter) ?? 'waiting';
  const setFilterParam = useSetFilterParam('handoff');
  const page = useFilterPage();
  const setPage = useSetFilterPage();
  const conversationId = useFilterParam('conversationId');
  const setConversationId = useSetFilterParam('conversationId');
  const [selected, setSelected] = useState<WhatsAppConversation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setConversations(
        await adminFetch<PaginatedResponse<WhatsAppConversation>>('/admin/crm/whatsapp/conversations', {
          query: { handedOff: filter === 'all' ? undefined : true, page, pageSize: 20 },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load WhatsApp conversations');
    } finally {
      setBusy(false);
    }
  }, [filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(async (id: string) => {
    setError(null);
    try {
      setSelected(await adminFetch<WhatsAppConversation>(`/admin/crm/whatsapp/conversations/${id}`));
      setConversationId(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open that conversation');
    }
  }, [setConversationId]);

  // Opened directly from a customer's own record (contacts page links here
  // with ?conversationId=…) — never leaves that deep link a dead end.
  useEffect(() => {
    if (conversationId && selected?.id !== conversationId) void open(conversationId);
  }, [conversationId, selected?.id, open]);

  async function reply(id: string, text: string) {
    const updated = await adminFetch<WhatsAppConversation>(`/admin/crm/whatsapp/conversations/${id}/reply`, {
      method: 'POST',
      body: { text },
    });
    setSelected(updated);
    await load();
  }

  async function reopen(id: string) {
    const updated = await adminFetch<WhatsAppConversation>(`/admin/crm/whatsapp/conversations/${id}/reopen`, {
      method: 'POST',
    });
    setSelected(updated);
    await load();
  }

  return (
    <>
      <FilterBar
        filters={[]}
        trailing={
          <div className="flex gap-2">
            {(['waiting', 'all'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilterParam(option === 'waiting' ? null : option)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm capitalize',
                  filter === option ? 'bg-accent-hover text-white' : 'text-neutral-900/60 hover:bg-neutral-50',
                )}
              >
                {option === 'waiting' ? 'Waiting on you' : 'All'}
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_28rem]">
        <div className="overflow-hidden">
          <DataTable
            rows={conversations?.data}
            loading={busy && !conversations}
            emptyLabel={filter === 'waiting' ? 'Nothing waiting on you.' : 'No conversations yet.'}
            rowKey={(conversation) => conversation.id}
            onRowClick={(conversation) => void open(conversation.id)}
            isRowSelected={(conversation) => selected?.id === conversation.id}
            columns={[
              {
                header: 'Customer',
                cell: (conversation) => (
                  <>
                    <p className="font-medium text-neutral-900">{conversation.contact.name}</p>
                    <p className="text-xs text-neutral-900/60">{conversation.phoneE164}</p>
                  </>
                ),
              },
              {
                header: 'Status',
                cell: (conversation) =>
                  conversation.handedOffToHuman ? (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Waiting on you
                    </span>
                  ) : (
                    <span className="rounded bg-neutral-50 px-2 py-0.5 text-xs font-medium text-accent-hover">
                      Assistant handling
                    </span>
                  ),
              },
              {
                header: 'Messages',
                muted: true,
                cell: (conversation) => conversation._count.messages,
              },
              {
                header: 'Last activity',
                muted: true,
                cell: (conversation) => formatDateTime(conversation.lastMessageAt),
              },
            ]}
          />

          {conversations ? <Pagination meta={conversations.meta} onChange={setPage} itemLabel="conversations" /> : null}
        </div>

        <aside className="card h-fit p-4 lg:sticky lg:top-4">
          {!selected ? (
            <p className="py-8 text-center text-sm text-neutral-900/60">Choose a conversation to read it.</p>
          ) : (
            <WhatsAppDetailPanel conversation={selected} onReply={reply} onReopen={reopen} />
          )}
        </aside>
      </div>
    </>
  );
}

function WhatsAppDetailPanel({
  conversation,
  onReply,
  onReopen,
}: {
  conversation: WhatsAppConversation;
  onReply: (id: string, text: string) => Promise<void>;
  onReopen: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    setDraft('');
    setSendError(null);
  }, [conversation.id]);

  async function submitReply() {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setSendError(null);
    try {
      await onReply(conversation.id, text);
      setDraft('');
    } catch (cause) {
      setSendError(cause instanceof Error ? cause.message : 'Could not send that reply');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-neutral-900">{conversation.contact.name}</h2>
      <p className="mt-1 text-sm text-neutral-900/60">{conversation.phoneE164}</p>
      {conversation.handoffReason ? (
        <p className="mt-1 text-xs text-amber-700">Handed off: {conversation.handoffReason}</p>
      ) : null}

      <ol className="mt-4 max-h-96 space-y-2 overflow-y-auto">
        {(conversation.messages ?? []).map((message) => (
          <li
            key={message.id}
            className={cn(
              'max-w-[85%] rounded-md p-2 text-sm',
              message.direction === 'OUTBOUND'
                ? 'ms-auto bg-accent-hover/10 text-neutral-900'
                : 'bg-neutral-50 text-neutral-900/90',
            )}
          >
            <p className="whitespace-pre-wrap">{message.body}</p>
            <p className="mt-1 text-[10px] text-neutral-900/60">
              {formatDateTime(message.createdAt)}
              {message.aiGenerated ? ' · assistant' : message.direction === 'OUTBOUND' ? ' · staff' : ''}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-4 border-t border-neutral-100 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60">Reply</h3>
        <textarea
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Reply to ${conversation.contact.name}…`}
          className="field-input mt-2 text-sm"
        />
        {sendError ? <p className="mt-1 text-xs text-red-700">{sendError}</p> : null}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void submitReply()}
            disabled={sending || !draft.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send reply'}
          </button>
          {conversation.handedOffToHuman ? (
            <button type="button" onClick={() => void onReopen(conversation.id)} className="btn-ghost text-sm">
              Let the assistant resume
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
