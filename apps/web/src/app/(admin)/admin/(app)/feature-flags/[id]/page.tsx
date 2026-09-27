'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDate } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { PageHeader, Loading, Badge } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

interface FeatureFlagDetail {
  id: string;
  key: string;
  description: string;
  rolloutPercent: number;
  enabledOrgIds: string[];
  killSwitch: boolean;
  moneyOrStockPath: boolean;
  proposedRolloutPercent: number | null;
  proposedKillSwitchOff: boolean;
  proposedById: string | null;
  proposedAt: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  removalCriteria: string | null;
  createdAt: string;
}

/**
 * resilience-scalability/37-scalability-future-upgrades.md (WO-37.2/37.5).
 * The maker-checker flow for a money/stock-path flag's risky transition
 * mirrors settlements/[id]/page.tsx's own request/approve-writeoff shape
 * exactly: propose, then a different person approves, checked again
 * server-side either way.
 */
export default function FeatureFlagDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useAdminSession();
  const canManage = session.can('platform.flags.manage');
  const canApprove = session.can('platform.flags.approve_rollout');

  const [flag, setFlag] = useState<FeatureFlagDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [description, setDescription] = useState('');
  const [removalCriteria, setRemovalCriteria] = useState('');
  const [rolloutPercent, setRolloutPercent] = useState(0);
  const [enabledOrgIdsText, setEnabledOrgIdsText] = useState('');

  const load = () => {
    adminFetch<FeatureFlagDetail>(`/admin/feature-flags/${id}`)
      .then((f) => {
        setFlag(f);
        setDescription(f.description);
        setRemovalCriteria(f.removalCriteria ?? '');
        setRolloutPercent(f.rolloutPercent);
        setEnabledOrgIdsText(f.enabledOrgIds.join(', '));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this feature flag'));
  };

  useEffect(load, [id]);

  const patch = async (body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/feature-flags/${id}`, { method: 'PATCH', body });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/feature-flags/${id}${path}`, { method: 'POST', body });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (!flag) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading label="Loading feature flag" />
    );
  }

  const isSelfProposer = flag.proposedById === session.id;
  const enabledOrgIds = () =>
    enabledOrgIdsText
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

  return (
    <>
      <PageHeader
        context={
          <Link href={ROUTES.admin.featureFlags} className="hover:underline">
            ← Feature flags
          </Link>
        }
        title={flag.key}
        description={flag.description}
        action={flag.killSwitch ? <Badge tone="danger">Kill switch on</Badge> : <Badge tone="info">{flag.rolloutPercent}% rollout</Badge>}
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {!flag.removalCriteria ? (
        <p className="notice notice-info mb-4">
          No removal criteria stated — this flag surfaces on the staleness report 90 days after {formatDate(flag.createdAt)}.
        </p>
      ) : null}

      <div className="card p-6 mb-6 max-w-lg space-y-3">
        <label className="block">
          <span className="field-label">Description</span>
          <textarea
            className="field-input w-full"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canManage}
          />
        </label>
        <label className="block">
          <span className="field-label">Removal criteria</span>
          <input
            className="field-input w-full"
            value={removalCriteria}
            onChange={(e) => setRemovalCriteria(e.target.value)}
            disabled={!canManage}
            placeholder="Remove once at 100% for 30 days, or promote to a permanent setting"
          />
        </label>
        <label className="block">
          <span className="field-label">Organizations explicitly enabled (comma-separated ids)</span>
          <input
            className="field-input w-full"
            value={enabledOrgIdsText}
            onChange={(e) => setEnabledOrgIdsText(e.target.value)}
            disabled={!canManage}
          />
        </label>
        {canManage ? (
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => patch({ description, removalCriteria: removalCriteria || undefined, enabledOrgIds: enabledOrgIds() })}
          >
            Save
          </button>
        ) : null}
      </div>

      <div className="card p-6 mb-6 max-w-lg space-y-3">
        <h2 className="font-medium text-neutral-900">Rollout percentage</h2>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={rolloutPercent}
            onChange={(e) => setRolloutPercent(Number(e.target.value))}
            disabled={!canManage}
            className="w-full"
          />
          <span className="tabular-nums w-12 text-end">{rolloutPercent}%</span>
        </div>
        {canManage ? (
          flag.moneyOrStockPath && rolloutPercent === 100 && flag.rolloutPercent !== 100 ? (
            <button className="btn-secondary" disabled={busy} onClick={() => act('/propose-rollout', { rolloutPercent: 100 })}>
              Propose raising to 100% (needs a second approver)
            </button>
          ) : (
            <button className="btn-secondary" disabled={busy || rolloutPercent === flag.rolloutPercent} onClick={() => patch({ rolloutPercent })}>
              Apply
            </button>
          )
        ) : null}
      </div>

      <div className="card p-6 max-w-lg space-y-3">
        <h2 className="font-medium text-neutral-900">Kill switch</h2>
        <p className="text-xs text-neutral-900/60">Forces this flag off for every organization, on the next request, with no deploy.</p>
        {canManage && !flag.killSwitch ? (
          <button className="btn-danger" disabled={busy} onClick={() => patch({ killSwitch: true })}>
            Turn on kill switch
          </button>
        ) : null}
        {flag.killSwitch && canManage ? (
          flag.moneyOrStockPath ? (
            !flag.proposedById || !flag.proposedKillSwitchOff ? (
              <button className="btn-secondary" disabled={busy} onClick={() => act('/propose-rollout', { killSwitchOff: true })}>
                Propose clearing (needs a second approver)
              </button>
            ) : null
          ) : (
            <button className="btn-secondary" disabled={busy} onClick={() => patch({ killSwitch: false })}>
              Clear kill switch
            </button>
          )
        ) : null}

        {flag.proposedById ? (
          canApprove && !isSelfProposer ? (
            <button className="btn-secondary" disabled={busy} onClick={() => act('/approve-rollout')}>
              Approve proposed change
              {flag.proposedRolloutPercent !== null ? ` — rollout to ${flag.proposedRolloutPercent}%` : ''}
              {flag.proposedKillSwitchOff ? ' — clear kill switch' : ''}
            </button>
          ) : (
            <p className="notice notice-info">
              {isSelfProposer
                ? 'You proposed this change — a different approver holding platform.flags.approve_rollout must confirm it.'
                : 'Awaiting approval from someone holding platform.flags.approve_rollout.'}
            </p>
          )
        ) : null}
      </div>
    </>
  );
}
