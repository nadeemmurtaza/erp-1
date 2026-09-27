'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { EmptyState, Loading, PageHeader } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

interface BulletinRow {
  id: string;
  title: string;
  bodyMarkdown: string;
  category: 'POLICY' | 'MEMO' | 'NOTICE' | 'HR_ANNOUNCEMENT';
  publishedAt: string;
  expiresAt: string | null;
  requiresAcknowledgement: boolean;
}

const CATEGORY_LABEL: Record<BulletinRow['category'], string> = {
  POLICY: 'Policy',
  MEMO: 'Memo',
  NOTICE: 'Notice',
  HR_ANNOUNCEMENT: 'HR announcement',
};

/**
 * tasks-notifications-support/61-policy-communications-bulletin.md
 * (WO-61.5). Reads a persistent record, not a notification — every notice
 * the caller's own org-tree membership reaches stays here until retracted
 * or it expires. Posting a new one is a separate page (`hr.bulletins.publish`
 * is narrower than `hr.bulletins.view`, which is seeded broadly).
 */
export default function BulletinsPage() {
  const { can } = useAdminSession();
  const canView = can('hr.bulletins.view');
  const canPublish = can('hr.bulletins.publish');

  const [rows, setRows] = useState<BulletinRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () =>
    adminFetch<BulletinRow[]>('/admin/bulletins')
      .then(setRows)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the bulletin board'));

  useEffect(() => {
    if (canView) load();
  }, [canView]);

  const acknowledge = async (id: string) => {
    setBusyId(id);
    try {
      await adminFetch(`/admin/bulletins/${id}/acknowledge`, { method: 'POST' });
      setAcknowledgedIds((prev) => new Set(prev).add(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record your acknowledgement');
    } finally {
      setBusyId(null);
    }
  };

  const retract = async (id: string) => {
    setBusyId(id);
    try {
      await adminFetch(`/admin/bulletins/${id}/retract`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not retract this notice');
    } finally {
      setBusyId(null);
    }
  };

  if (!canView) {
    return (
      <>
        <PageHeader title="Bulletins" description="Company policy notices and memos." />
        <p className="notice">You do not hold the permission needed to read the bulletin board.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Bulletins"
        description="Company policy notices and memos — visible to everyone within their own part of the organization."
        action={
          canPublish ? (
            <Link href={ROUTES.admin.bulletinNew} className="btn-primary">
              Post a notice
            </Link>
          ) : undefined
        }
      />

      {error ? <p className="notice notice-error">{error}</p> : null}

      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No notices right now"
          description="Nothing has been posted to your part of the organization."
          action={
            canPublish ? (
              <Link href={ROUTES.admin.bulletinNew} className="btn-primary">
                Post a notice
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((bulletin) => {
            const expanded = expandedId === bulletin.id;
            const acknowledged = acknowledgedIds.has(bulletin.id);
            return (
              <div key={bulletin.id} className="card space-y-3">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-4 text-start"
                  onClick={() => setExpandedId(expanded ? null : bulletin.id)}
                  aria-expanded={expanded}
                >
                  <div>
                    <p className="eyebrow">{CATEGORY_LABEL[bulletin.category]}</p>
                    <p className="font-medium text-neutral-900">{bulletin.title}</p>
                    <p className="text-sm text-neutral-900/60">{formatDateTime(bulletin.publishedAt)}</p>
                  </div>
                </button>

                {expanded ? (
                  <div className="space-y-3 border-t border-neutral-100 pt-3">
                    <p className="whitespace-pre-wrap text-sm text-neutral-900">{bulletin.bodyMarkdown}</p>
                    {bulletin.expiresAt ? (
                      <p className="text-sm text-neutral-900/60">Expires {formatDateTime(bulletin.expiresAt)}.</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {bulletin.requiresAcknowledgement ? (
                        <button
                          className="btn btn-secondary"
                          disabled={busyId === bulletin.id || acknowledged}
                          onClick={() => acknowledge(bulletin.id)}
                        >
                          {acknowledged ? 'Acknowledged' : 'Acknowledge'}
                        </button>
                      ) : null}
                      {canPublish ? (
                        <button className="btn btn-text" disabled={busyId === bulletin.id} onClick={() => retract(bulletin.id)}>
                          Retract
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
