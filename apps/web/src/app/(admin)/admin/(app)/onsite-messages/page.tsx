'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDateTime } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { downloadCsv } from '@/lib/download-csv';
import { DataTable, Dialog, Loading, PageHeader, Tabs } from '@/components/ui';
import { ToastStack } from '@/components/admin/toast-stack';
import { useToast } from '@/hooks/use-toast';

const MESSAGE_KINDS = ['ANNOUNCEMENT_BAR', 'POPUP', 'NEWSLETTER_CAPTURE', 'COOKIE_CONSENT'] as const;
const POPUP_TRIGGERS = ['IMMEDIATE', 'TIMED', 'EXIT_INTENT'] as const;

interface OnsiteMessage {
  id: string;
  kind: (typeof MESSAGE_KINDS)[number];
  pagePattern: string | null;
  segmentId: string | null;
  trigger: (typeof POPUP_TRIGGERS)[number];
  delaySeconds: number | null;
  linkUrl: string | null;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  translations: { locale: string; headline: string | null; body: string | null; ctaLabel: string | null }[];
}

interface Segment {
  id: string;
  name: string;
}

interface NewsletterSubscriber {
  id: string;
  email: string;
  locale: string;
  subscribedAt: string;
  optedOutAt: string | null;
}

function headlineOf(message: OnsiteMessage): string {
  const en = message.translations.find((t) => t.locale === 'en');
  return en?.headline ?? message.translations[0]?.headline ?? '(no headline)';
}

/** Local datetime input <-> ISO string. Empty string round-trips to undefined either way. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditDialog({
  open,
  onClose,
  message,
  segments,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  message: OnsiteMessage | null;
  segments: Segment[];
  onSaved: () => Promise<void>;
}) {
  const { add: addToast } = useToast();
  const [kind, setKind] = useState<(typeof MESSAGE_KINDS)[number]>('ANNOUNCEMENT_BAR');
  const [pagePattern, setPagePattern] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [trigger, setTrigger] = useState<(typeof POPUP_TRIGGERS)[number]>('IMMEDIATE');
  const [delaySeconds, setDelaySeconds] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (message) {
      const en = message.translations.find((t) => t.locale === 'en');
      setKind(message.kind);
      setPagePattern(message.pagePattern ?? '');
      setSegmentId(message.segmentId ?? '');
      setTrigger(message.trigger);
      setDelaySeconds(message.delaySeconds ? String(message.delaySeconds) : '');
      setLinkUrl(message.linkUrl ?? '');
      setIsActive(message.isActive);
      setStartsAt(toLocalInput(message.startsAt));
      setEndsAt(toLocalInput(message.endsAt));
      setHeadline(en?.headline ?? '');
      setBody(en?.body ?? '');
      setCtaLabel(en?.ctaLabel ?? '');
    } else {
      setKind('ANNOUNCEMENT_BAR');
      setPagePattern('');
      setSegmentId('');
      setTrigger('IMMEDIATE');
      setDelaySeconds('');
      setLinkUrl('');
      setIsActive(true);
      setStartsAt('');
      setEndsAt('');
      setHeadline('');
      setBody('');
      setCtaLabel('');
    }
  }, [message, open]);

  async function save() {
    setSaving(true);
    try {
      const payload = {
        kind,
        pagePattern: pagePattern.trim() || null,
        segmentId: segmentId || null,
        trigger: kind === 'POPUP' ? trigger : undefined,
        delaySeconds: kind === 'POPUP' && trigger === 'TIMED' && delaySeconds ? Number(delaySeconds) : null,
        linkUrl: linkUrl.trim() || null,
        isActive,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        translations: [{ locale: 'en' as const, headline: headline || undefined, body: body || undefined, ctaLabel: ctaLabel || undefined }],
      };

      if (message) {
        await adminFetch(`/admin/onsite-messages/${message.id}`, { method: 'PATCH', body: payload });
      } else {
        await adminFetch('/admin/onsite-messages', { method: 'POST', body: payload });
      }
      addToast('Message saved', 'success');
      await onSaved();
      onClose();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not save the message', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={message ? 'Edit message' : 'New on-site message'}>
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="field-label">
            Kind
            <select className="field-input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {MESSAGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Target page (blank = every page)
            <input className="field-input" placeholder="/shop" value={pagePattern} onChange={(e) => setPagePattern(e.target.value)} />
          </label>
        </div>

        <label className="field-label">
          Target segment (blank = everyone — a segment only ever matches a signed-in customer)
          <select className="field-input" value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            <option value="">Everyone</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {kind === 'POPUP' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="field-label">
              Trigger
              <select className="field-input" value={trigger} onChange={(e) => setTrigger(e.target.value as typeof trigger)}>
                {POPUP_TRIGGERS.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>

            {trigger === 'TIMED' && (
              <label className="field-label">
                Delay (seconds)
                <input
                  type="number"
                  min={1}
                  className="field-input"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(e.target.value)}
                />
              </label>
            )}
          </div>
        )}

        <label className="field-label">
          Headline
          <input className="field-input" value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </label>

        <label className="field-label">
          Body
          <textarea className="field-input min-h-[80px] w-full" value={body} onChange={(e) => setBody(e.target.value)} />
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="field-label">
            Button label
            <input className="field-input" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
          </label>
          <label className="field-label">
            Link URL
            <input className="field-input" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="field-label">
            Starts (blank = immediately)
            <input type="datetime-local" className="field-input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="field-label">
            Ends (blank = no end)
            <input type="datetime-local" className="field-input" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-900/70">
          <input type="checkbox" className="field-check" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export default function OnsiteMessagesAdminPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [messages, setMessages] = useState<OnsiteMessage[] | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[] | null>(null);
  const [editing, setEditing] = useState<OnsiteMessage | null | 'new'>(null);

  const load = useCallback(async () => {
    try {
      const [m, seg, sub] = await Promise.all([
        adminFetch<OnsiteMessage[]>('/admin/onsite-messages'),
        adminFetch<Segment[]>('/admin/crm/segments'),
        adminFetch<{ data: NewsletterSubscriber[] }>('/admin/onsite-messages/newsletter-subscribers?pageSize=100'),
      ]);
      setMessages(m);
      setSegments(seg);
      setSubscribers(sub.data);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not load on-site messages', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(message: OnsiteMessage) {
    try {
      await adminFetch(`/admin/onsite-messages/${message.id}`, { method: 'PATCH', body: { isActive: !message.isActive } });
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not update the message', 'error');
    }
  }

  async function removeMessage(message: OnsiteMessage) {
    if (!window.confirm(`Delete this ${message.kind.replace(/_/g, ' ').toLowerCase()}? This cannot be undone.`)) return;
    try {
      await adminFetch(`/admin/onsite-messages/${message.id}`, { method: 'DELETE' });
      addToast('Message deleted', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not delete the message', 'error');
    }
  }

  async function optOutSubscriber(subscriber: NewsletterSubscriber) {
    if (!window.confirm(`Opt out ${subscriber.email} from the newsletter?`)) return;
    try {
      await adminFetch(`/admin/onsite-messages/newsletter-subscribers/${subscriber.id}/opt-out`, { method: 'PATCH' });
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not opt the subscriber out', 'error');
    }
  }

  async function exportSubscribers() {
    try {
      await downloadCsv('/admin/onsite-messages/newsletter-subscribers/export', 'newsletter-subscribers.csv');
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not export subscribers', 'error');
    }
  }

  if (!messages || !subscribers) return <Loading label="Loading on-site messages" />;

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader
        title="On-site messages"
        description="Announcement bars, popups, newsletter capture and cookie consent — scheduled and targetable, WO-8.6."
      />

      <Tabs
        label="On-site messaging sections"
        items={[
          {
            key: 'messages',
            label: 'Messages',
            content: (
              <div>
                <div className="mb-3 flex justify-end">
                  <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
                    New message
                  </button>
                </div>
                <DataTable
                  rows={messages}
                  rowKey={(m) => m.id}
                  emptyLabel="No on-site messages yet"
                  onRowClick={(m) => setEditing(m)}
                  columns={[
                    { header: 'Headline', cell: (m) => headlineOf(m) },
                    { header: 'Kind', cell: (m) => m.kind.replace(/_/g, ' '), muted: true },
                    { header: 'Page', cell: (m) => m.pagePattern ?? 'Every page', muted: true },
                    {
                      header: 'Status',
                      cell: (m) => (m.isActive ? 'Active' : 'Paused'),
                      muted: true,
                    },
                    {
                      header: '',
                      cell: (m) => (
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            className="btn-text"
                            onClick={(e) => {
                              e.stopPropagation();
                              void toggleActive(m);
                            }}
                          >
                            {m.isActive ? 'Pause' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            className="btn-text"
                            onClick={(e) => {
                              e.stopPropagation();
                              void removeMessage(m);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'newsletter',
            label: 'Newsletter subscribers',
            content: (
              <div>
                <div className="mb-3 flex justify-end">
                  <button type="button" className="btn-secondary" onClick={() => void exportSubscribers()}>
                    Export CSV
                  </button>
                </div>
                <DataTable
                  rows={subscribers}
                  rowKey={(s) => s.id}
                  emptyLabel="No newsletter subscribers yet"
                  columns={[
                    { header: 'Email', cell: (s) => s.email },
                    { header: 'Subscribed', cell: (s) => formatDateTime(s.subscribedAt), muted: true },
                    { header: 'Status', cell: (s) => (s.optedOutAt ? 'Opted out' : 'Subscribed'), muted: true },
                    {
                      header: '',
                      cell: (s) =>
                        s.optedOutAt ? null : (
                          <button type="button" className="btn-text" onClick={() => void optOutSubscriber(s)}>
                            Opt out
                          </button>
                        ),
                    },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />

      <EditDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        message={editing === 'new' ? null : editing}
        segments={segments}
        onSaved={load}
      />
    </>
  );
}
