'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import { Loading, PageHeader } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

const CATEGORIES = [
  { value: 'POLICY', label: 'Policy' },
  { value: 'MEMO', label: 'Memo' },
  { value: 'NOTICE', label: 'Notice' },
  { value: 'HR_ANNOUNCEMENT', label: 'HR announcement' },
] as const;

/**
 * tasks-notifications-support/61-policy-communications-bulletin.md
 * (WO-61.5). No org-unit picker exists yet in this codebase — the org
 * unit id is pasted, the same pragmatic pattern `NotifyComposePage`
 * already uses.
 */
export default function NewBulletinPage() {
  const router = useRouter();
  const { can } = useAdminSession();
  const canPublish = can('hr.bulletins.publish');

  const [title, setTitle] = useState('');
  const [bodyMarkdown, setBodyMarkdown] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('NOTICE');
  const [audienceOrgUnitId, setAudienceOrgUnitId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = async () => {
    setError(null);
    setBusy(true);
    try {
      await adminFetch('/admin/bulletins', {
        method: 'POST',
        body: {
          title,
          bodyMarkdown,
          category,
          audienceOrgUnitId: audienceOrgUnitId.trim() || undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          requiresAcknowledgement,
        },
      });
      router.push(ROUTES.admin.bulletins);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish this notice');
    } finally {
      setBusy(false);
    }
  };

  const backLink = (
    <Link href={ROUTES.admin.bulletins} className="hover:underline">
      ← Bulletins
    </Link>
  );

  if (!canPublish) {
    return (
      <>
        <PageHeader title="Post a notice" context={backLink} />
        <p className="notice">You do not hold the permission needed to post a notice.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Post a notice"
        description="Published to a part of the organization you hold a posting at — everyone within its reach can read it."
        context={backLink}
      />

      <div className="card space-y-4">
        <div>
          <label className="field-label" htmlFor="title">Title</label>
          <input id="title" className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="category">Category</label>
          <select id="category" className="field-input" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="body">Notice</label>
          <textarea id="body" className="field-input" rows={6} value={bodyMarkdown} onChange={(e) => setBodyMarkdown(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="audienceOrgUnitId">Org unit (blank = whole organization, if your reach allows it)</label>
          <input id="audienceOrgUnitId" className="field-input" value={audienceOrgUnitId} onChange={(e) => setAudienceOrgUnitId(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="expiresAt">Expires (optional)</label>
          <input id="expiresAt" type="datetime-local" className="field-input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
        <label className="field-check">
          <input type="checkbox" checked={requiresAcknowledgement} onChange={(e) => setRequiresAcknowledgement(e.target.checked)} />
          Require readers to acknowledge this notice
        </label>

        {error ? <p className="notice notice-error">{error}</p> : null}

        <button className="btn btn-primary" onClick={publish} disabled={busy || !title.trim() || !bodyMarkdown.trim()}>
          {busy ? <Loading /> : 'Publish'}
        </button>
      </div>
    </>
  );
}
