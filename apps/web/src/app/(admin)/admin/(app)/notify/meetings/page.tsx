'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { PageHeader, Loading } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

interface MeetingView {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location: string | null;
  cancelledAt: string | null;
}

interface ShortfallReport {
  requiredCount: number;
  answeredCount: number;
  shortfallCount: number;
  shortfallUserIds: string[];
}

/** tasks-notifications-support/24-internal-notifications-meetings-escalation.md WO-24.6 — call a meeting, and see its own shortfall report. */
export default function MeetingsPage() {
  const { can } = useAdminSession();
  const canSend = can('notify.send');

  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [timezone, setTimezone] = useState('Asia/Karachi');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [audienceOrgUnitId, setAudienceOrgUnitId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MeetingView | null>(null);
  const [shortfallMeetingId, setShortfallMeetingId] = useState('');
  const [shortfall, setShortfall] = useState<ShortfallReport | null>(null);

  const create = async () => {
    setError(null);
    setBusy(true);
    try {
      const meeting = await adminFetch<MeetingView>('/admin/notify/meetings', {
        method: 'POST',
        body: {
          title,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          timezone,
          orgUnitId,
          audience: { orgUnitId: audienceOrgUnitId.trim() || undefined },
        },
      });
      setCreated(meeting);
      setTitle('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not call this meeting');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setBusy(true);
    try {
      await adminFetch(`/admin/notify/meetings/${id}/cancel`, { method: 'POST' });
      if (created?.id === id) setCreated({ ...created, cancelledAt: new Date().toISOString() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not cancel this meeting');
    } finally {
      setBusy(false);
    }
  };

  const checkShortfall = async () => {
    if (!shortfallMeetingId.trim()) return;
    setError(null);
    try {
      setShortfall(await adminFetch<ShortfallReport>(`/admin/notify/meetings/${shortfallMeetingId.trim()}/shortfall`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this meeting\'s shortfall report');
    }
  };

  if (!canSend) {
    return (
      <>
        <PageHeader title="Meetings" description="Call a meeting, addressed to an audience." />
        <p className="notice">You do not hold the permission needed to call a meeting.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Meetings" description="Call a meeting, addressed to an audience — invitations are materialised at send time." />

      <div className="card space-y-4">
        <div>
          <label className="field-label" htmlFor="title">Title</label>
          <input id="title" className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label" htmlFor="startsAt">Starts</label>
            <input id="startsAt" type="datetime-local" className="field-input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="endsAt">Ends</label>
            <input id="endsAt" type="datetime-local" className="field-input" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="timezone">Timezone</label>
          <input id="timezone" className="field-input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="orgUnitId">This meeting belongs to org unit</label>
          <input id="orgUnitId" className="field-input" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="audienceOrgUnitId">Invite audience — org unit (blank = whole organization)</label>
          <input id="audienceOrgUnitId" className="field-input" value={audienceOrgUnitId} onChange={(e) => setAudienceOrgUnitId(e.target.value)} />
        </div>

        {error ? <p className="notice notice-error">{error}</p> : null}

        <button className="btn btn-primary" onClick={create} disabled={busy || !title.trim() || !startsAt || !endsAt || !orgUnitId.trim()}>
          {busy ? <Loading /> : 'Call meeting'}
        </button>

        {created ? (
          <div className="notice notice-success">
            &ldquo;{created.title}&rdquo; called for {formatDateTime(created.startsAt)}.
            {created.cancelledAt ? ' Cancelled.' : (
              <button className="btn btn-text" onClick={() => cancel(created.id)}>
                Cancel this meeting
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="card space-y-4">
        <h2 className="text-lg font-medium">Shortfall report</h2>
        <div>
          <label className="field-label" htmlFor="shortfallMeetingId">Meeting id</label>
          <input id="shortfallMeetingId" className="field-input" value={shortfallMeetingId} onChange={(e) => setShortfallMeetingId(e.target.value)} />
        </div>
        <button className="btn btn-secondary" onClick={checkShortfall} disabled={!shortfallMeetingId.trim()}>
          Check
        </button>
        {shortfall ? (
          <p className="notice notice-info">
            {shortfall.answeredCount} of {shortfall.requiredCount} required invitees have answered
            {shortfall.shortfallCount > 0 ? ` — ${shortfall.shortfallCount} have not responded` : ''}.
          </p>
        ) : null}
      </div>
    </>
  );
}
