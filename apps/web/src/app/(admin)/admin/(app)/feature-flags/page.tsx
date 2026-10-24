'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDate } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { DataTable, EmptyState, PageHeader, Dialog, Badge } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

interface FeatureFlagRow {
  id: string;
  key: string;
  description: string;
  rolloutPercent: number;
  enabledOrgIds: string[];
  killSwitch: boolean;
  moneyOrStockPath: boolean;
  proposedById: string | null;
  removalCriteria: string | null;
  createdAt: string;
}

/**
 * resilience-scalability/37-scalability-future-upgrades.md (WO-37.2/37.3).
 * "A de-risking tool, not a permanent branch in the code" — every row here
 * either states its own removal criteria or shows up on the staleness
 * banner above the table, so an un-owned flag is never just quietly there.
 */
export default function FeatureFlagsPage() {
  const { can } = useAdminSession();
  const canManage = can('platform.flags.manage');

  const [rows, setRows] = useState<FeatureFlagRow[] | null>(null);
  const [stale, setStale] = useState<FeatureFlagRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [removalCriteria, setRemovalCriteria] = useState('');
  const [moneyOrStockPath, setMoneyOrStockPath] = useState(false);

  const load = () => {
    setBusy(true);
    setError(null);
    Promise.all([
      adminFetch<{ data: FeatureFlagRow[] }>('/admin/feature-flags'),
      adminFetch<{ data: FeatureFlagRow[] }>('/admin/feature-flags/audit'),
    ])
      .then(([all, staleFlags]) => {
        setRows(all.data);
        setStale(staleFlags.data);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load feature flags'))
      .finally(() => setBusy(false));
  };

  useEffect(load, []);

  const create = async () => {
    if (!key.trim() || !description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch('/admin/feature-flags', {
        method: 'POST',
        body: { key: key.trim(), description: description.trim(), removalCriteria: removalCriteria.trim() || undefined, moneyOrStockPath },
      });
      setNewOpen(false);
      setKey('');
      setDescription('');
      setRemovalCriteria('');
      setMoneyOrStockPath(false);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this flag');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Feature flags"
        description="Stage a finished capability to some organizations or a percentage of them, and watch before rolling it out to everyone."
        action={
          canManage ? (
            <button className="btn-primary" onClick={() => setNewOpen(true)}>
              New flag
            </button>
          ) : undefined
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {stale.length > 0 ? (
        <p className="notice notice-info mb-4">
          {stale.length} flag{stale.length === 1 ? '' : 's'} older than 90 days state no removal criteria:{' '}
          {stale.map((f, i) => (
            <span key={f.id}>
              {i > 0 ? ', ' : ''}
              <Link href={ROUTES.admin.featureFlag(f.id)} className="underline">
                {f.key}
              </Link>
            </span>
          ))}
          . A flag is a de-risking tool, not a permanent branch — give each one a removal date or promote it to a
          permanent setting.
        </p>
      ) : null}

      <div className="overflow-hidden">
        {rows && rows.length === 0 ? (
          <EmptyState
            title="No feature flags"
            description="Nothing is being staged right now."
            action={
              canManage ? (
                <button className="btn-primary" onClick={() => setNewOpen(true)}>
                  New flag
                </button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            rows={rows}
            loading={busy && !rows}
            emptyLabel="No feature flags found."
            rowKey={(r) => r.id}
            columns={[
              {
                header: 'Key',
                cell: (r) => (
                  <Link href={ROUTES.admin.featureFlag(r.id)} className="font-medium text-accent-hover hover:underline">
                    {r.key}
                  </Link>
                ),
              },
              { header: 'Description', cell: (r) => r.description, muted: true },
              {
                header: 'Rollout',
                cell: (r) => (r.killSwitch ? <Badge tone="danger">Kill switch</Badge> : `${r.rolloutPercent}%`),
              },
              {
                header: 'Orgs allowed',
                align: 'end',
                numeric: true,
                cell: (r) => r.enabledOrgIds.length,
              },
              {
                header: 'Removal criteria',
                cell: (r) =>
                  r.removalCriteria ? (
                    r.removalCriteria
                  ) : (
                    <Badge tone="warning">None stated</Badge>
                  ),
              },
              { header: 'Created', cell: (r) => formatDate(r.createdAt), muted: true },
            ]}
          />
        )}
      </div>

      <Dialog open={newOpen} onClose={saving ? () => {} : () => setNewOpen(false)} title="New feature flag">
        <div className="space-y-3">
          <label className="block">
            <span className="field-label">Key</span>
            <input
              className="field-input w-full"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="payroll.advance-salary-v2"
            />
          </label>
          <label className="block">
            <span className="field-label">Description</span>
            <textarea className="field-input w-full" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Removal criteria (optional now, flagged after 90 days if left blank)</span>
            <input
              className="field-input w-full"
              value={removalCriteria}
              onChange={(e) => setRemovalCriteria(e.target.value)}
              placeholder="Remove once at 100% for 30 days, or promote to a permanent setting"
            />
          </label>
          <label className="field-inline">
            <input type="checkbox" className="field-check" checked={moneyOrStockPath} onChange={(e) => setMoneyOrStockPath(e.target.checked)} />
            <span>This flag gates a money- or stock-writing path — 100% rollout and clearing the kill switch will need a second approver</span>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={saving} onClick={() => setNewOpen(false)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={saving || !key.trim() || !description.trim()} onClick={create}>
            Create
          </button>
        </div>
      </Dialog>
    </>
  );
}
