'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, Dialog, Loading, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { ToastStack } from '@/components/admin/toast-stack';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';

interface Segment {
  id: string;
  name: string;
}

interface Campaign {
  id: string;
  name: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED';
  scheduledAt: string | null;
  sentAt: string | null;
  segment: Segment;
  recipients?: { status: string }[];
}

const CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'] as const;

function NewCampaignDialog({
  open,
  onClose,
  segments,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  segments: Segment[];
  onSaved: () => Promise<void>;
}) {
  const { add: addToast } = useToast();
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('EMAIL');
  const [segmentId, setSegmentId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setChannel('EMAIL');
      setSegmentId(segments[0]?.id ?? '');
      setSubject('');
      setBody('');
    }
  }, [open, segments]);

  async function save() {
    if (!segmentId) {
      addToast('Create a segment first', 'error');
      return;
    }
    setSaving(true);
    try {
      await adminFetch('/admin/campaigns', {
        method: 'POST',
        body: {
          name,
          channel,
          segmentId,
          content: { en: { subject: channel === 'EMAIL' ? subject : undefined, body } },
        },
      });
      addToast('Campaign created as a draft', 'success');
      await onSaved();
      onClose();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not create the campaign', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New campaign">
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="field-label">
            Name
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field-label">
            Channel
            <select className="field-input" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field-label">
          Audience segment
          <select className="field-input" value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            {segments.length === 0 ? <option value="">No segments yet — create one first</option> : null}
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {channel === 'EMAIL' ? (
          <label className="field-label">
            Subject
            <input className="field-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
        ) : null}

        <label className="field-label">
          Message
          <textarea className="field-input min-h-[120px] w-full" value={body} onChange={(e) => setBody(e.target.value)} />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={saving || !name || !body || !segmentId} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save as draft'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export default function CampaignsAdminPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([
        adminFetch<Campaign[]>('/admin/campaigns'),
        adminFetch<Segment[]>('/admin/crm/segments'),
      ]);
      setCampaigns(c);
      setSegments(s);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not load campaigns', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendNow(id: string) {
    try {
      await adminFetch(`/admin/campaigns/${id}/schedule`, { method: 'POST', body: {} });
      addToast('Campaign scheduled — it will start sending within a minute', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not schedule the campaign', 'error');
    }
  }

  async function cancel(id: string) {
    try {
      await adminFetch(`/admin/campaigns/${id}/cancel`, { method: 'POST' });
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not cancel the campaign', 'error');
    }
  }

  if (!campaigns) return <Loading label="Loading campaigns" />;

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader
        title="Campaigns"
        description="Send a message to a customer segment over email, SMS or WhatsApp — WO-8.4."
        action={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            New campaign
          </button>
        }
      />

      <DataTable
        rows={campaigns}
        rowKey={(c) => c.id}
        emptyLabel="No campaigns yet"
        onRowClick={(c) => router.push(ROUTES.admin.campaign(c.id))}
        columns={[
          { header: 'Name', cell: (c) => c.name },
          { header: 'Channel', cell: (c) => c.channel, muted: true },
          { header: 'Segment', cell: (c) => c.segment.name, muted: true },
          { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
          {
            header: '',
            cell: (c) =>
              c.status === 'DRAFT' ? (
                <button
                  type="button"
                  className="btn-text"
                  onClick={(e) => {
                    e.stopPropagation();
                    void sendNow(c.id);
                  }}
                >
                  Send now
                </button>
              ) : c.status === 'SCHEDULED' ? (
                <button
                  type="button"
                  className="btn-text text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    void cancel(c.id);
                  }}
                >
                  Cancel
                </button>
              ) : null,
          },
        ]}
      />

      <NewCampaignDialog open={creating} onClose={() => setCreating(false)} segments={segments} onSaved={load} />
    </>
  );
}
