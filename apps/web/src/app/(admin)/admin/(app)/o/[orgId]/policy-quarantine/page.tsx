'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import type { MyScope, PolicyQuarantineEntry } from '@/types/api';
import { formatDateTime } from '@newax/shared';
import { EmptyState, Loading, PageHeader } from '@/components/ui';

/**
 * R9's quarantine (WO-23.3c/e) — a fact that applied but whose own
 * `scopeLevel` disagreed with the `BrandPolicy` switch meant to govern the
 * node that raised it. Never rejected (R5/R2), only flagged: this screen is
 * that flag's one job — see it, resolve it once reviewed. Scoped server-side
 * (`OrganizationService.listPolicyQuarantine`): an ORG-wide viewer sees every
 * open entry, a brand-scoped viewer only their own brand's.
 */
export default function PolicyQuarantinePage() {
  const [scope, setScope] = useState<MyScope | null>(null);
  const [entries, setEntries] = useState<PolicyQuarantineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { can } = useAdminSession();
  const canManage = can('organization.manage');

  const load = useCallback(async () => {
    try {
      const [scopeResult, entriesResult] = await Promise.all([
        adminFetch<MyScope>('/organization/me/scope'),
        adminFetch<PolicyQuarantineEntry[]>('/organization/policy-quarantine'),
      ]);
      setScope(scopeResult);
      setEntries(entriesResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the policy quarantine');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string) {
    setResolvingId(id);
    setError(null);
    try {
      await adminFetch(`/organization/policy-quarantine/${id}/resolve`, {
        method: 'POST',
        body: { note: notes[id] || undefined },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not resolve that entry');
    } finally {
      setResolvingId(null);
    }
  }

  const brandName = (id: string | null) => scope?.brands.find((brand) => brand.id === id)?.name ?? (id ?? 'Unknown brand');

  if (error) {
    return (
      <p role="alert" className="text-sm text-feedback-negative">
        {error}
      </p>
    );
  }

  if (!scope || !entries) return <Loading />;

  return (
    <>
      <PageHeader
        title="Policy quarantine"
        description="Facts that already happened but disagree with a brand's own policy switch — accepted, never rejected, held here for review."
      />

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing quarantined"
          description="Every branch-scope fact so far has matched its brand's own policy."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {entries.map((entry) => (
            <li key={entry.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900">
                    {entry.entity} · {brandName(entry.retailBrandId)}
                  </p>
                  <p className="mt-1 text-sm text-neutral-900/70">{entry.reason}</p>
                  <p className="mt-2 text-xs text-neutral-900/60">
                    From node {entry.originNodeId} · {formatDateTime(entry.createdAt)} · violates {entry.policyKey}
                  </p>
                </div>
              </div>

              {canManage ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Note (optional) — what did you decide?"
                    value={notes[entry.id] ?? ''}
                    onChange={(event) => setNotes({ ...notes, [entry.id]: event.target.value })}
                    className="field-input min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    disabled={resolvingId === entry.id}
                    onClick={() => void resolve(entry.id)}
                    className="btn-secondary shrink-0"
                  >
                    {resolvingId === entry.id ? 'Resolving…' : 'Mark reviewed'}
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-900/60">
                  Read-only — resolving this needs the organization.manage permission.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
