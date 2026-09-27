'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { PageHeader, Loading } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

interface AudienceSpec {
  orgUnitId?: string;
  includeDescendants?: boolean;
  minRankLevel?: number;
}

interface PreviewResult {
  recipients: Array<{ userId: string; name: string | null }>;
  requestedCount: number;
  excludedCount: number;
  needsApproval: boolean;
}

/**
 * tasks-notifications-support/24-internal-notifications-meetings-escalation.md
 * WO-24.6 — compose, with a live recipient preview and the exclusion
 * notice, before the send actually commits. No org-unit picker exists yet
 * in this codebase (the same gap `TasksPage` already notes for a Position
 * picker) — the org unit id is pasted, the same pragmatic pattern.
 */
export default function NotifyComposePage() {
  const { can } = useAdminSession();
  const canSend = can('notify.send');

  const [orgUnitId, setOrgUnitId] = useState('');
  const [minRankLevel, setMinRankLevel] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: 'SENT' | 'PENDING_APPROVAL' } | null>(null);

  const audience = (): AudienceSpec => ({
    orgUnitId: orgUnitId.trim() || undefined,
    minRankLevel: minRankLevel.trim() ? Number(minRankLevel) : undefined,
  });

  const runPreview = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await adminFetch<PreviewResult>('/admin/notify/preview', { method: 'POST', body: audience() });
      setPreview(res);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not resolve this audience');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const res = await adminFetch<{ id: string; status: 'SENT' | 'PENDING_APPROVAL' }>('/admin/notify/send', {
        method: 'POST',
        body: { audience: audience(), subject, body },
      });
      setResult({ status: res.status });
      setSubject('');
      setBody('');
      setPreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send this announcement');
    } finally {
      setBusy(false);
    }
  };

  if (!canSend) {
    return (
      <>
        <PageHeader title="Announcements" description="Send an internal message to a part of the organization." />
        <p className="notice">You do not hold the permission needed to send an internal announcement.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Announcements" description="Send an internal message to a part of the organization." />

      <div className="card space-y-4">
        <div>
          <label className="field-label" htmlFor="orgUnitId">Org unit (blank = whole organization)</label>
          <input id="orgUnitId" className="field-input" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} placeholder="Org unit id" />
        </div>
        <div>
          <label className="field-label" htmlFor="minRankLevel">Minimum rank level (blank = everyone)</label>
          <input id="minRankLevel" type="number" className="field-input" value={minRankLevel} onChange={(e) => setMinRankLevel(e.target.value)} />
        </div>
        <button className="btn btn-secondary" onClick={runPreview} disabled={busy}>
          Preview recipients
        </button>

        {preview ? (
          <div className="notice notice-info">
            {preview.recipients.length} recipient(s) reached, out of {preview.requestedCount} requested
            {preview.excludedCount > 0 ? ` (${preview.excludedCount} excluded — outside your own reach)` : ''}.
            {preview.needsApproval ? ' This send is above the quorum and will need a countersignature.' : ''}
          </div>
        ) : null}

        <div>
          <label className="field-label" htmlFor="subject">Subject</label>
          <input id="subject" className="field-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="body">Message</label>
          <textarea id="body" className="field-input" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        {error ? <p className="notice notice-error">{error}</p> : null}
        {result ? (
          <p className="notice notice-success">
            {result.status === 'SENT' ? 'Sent.' : 'Submitted — this announcement is above the quorum and now awaits a countersignature.'}
          </p>
        ) : null}

        <button className="btn btn-primary" onClick={send} disabled={busy || !subject.trim() || !body.trim()}>
          {busy ? <Loading /> : 'Send'}
        </button>
      </div>
    </>
  );
}
