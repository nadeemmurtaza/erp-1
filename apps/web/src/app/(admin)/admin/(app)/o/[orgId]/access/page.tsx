'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import type { AdminScopeWithHolder, AdminUser, MyScope } from '@/types/api';
import { PageHeader, EmptyState, Loading } from '@/components/ui';

type Level = 'ORG' | 'BRAND' | 'BRANCH';

interface Draft {
  userId: string;
  level: Level;
  retailBrandId: string;
  branchNodeId: string;
}

const BLANK: Draft = { userId: '', level: 'BRANCH', retailBrandId: '', branchNodeId: '' };

/**
 * Who is a super admin, a brand admin, or a branch admin (RETAIL-ERP.md
 * R10, WO-18.6) — the one screen that writes an `AdminScope` row. Reachable
 * only by an ORG-scoped holder of `organization.manage`; the API refuses
 * everyone else (`OrganizationService.assertOrgWide()`), so this page's own
 * job is to make the *legal* action easy, not to be the security boundary.
 *
 * No role for "brand admin" or "branch admin" exists anywhere in this
 * system (R10) — granting someone BRAND scope on Khaadi is the entire
 * mechanism that makes them "Khaadi's admin". What they may *do* once
 * scoped is the separate, already-existing Team & Access screen
 * (/admin/users) — this page only decides *where* their access reaches.
 */
export default function AdminScopesPage() {
  const [scope, setScope] = useState<MyScope | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [grants, setGrants] = useState<AdminScopeWithHolder[]>([]);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [scopeResult, usersResult, grantsResult] = await Promise.all([
        adminFetch<MyScope>('/organization/me/scope'),
        adminFetch<AdminUser[]>('/admin/users'),
        adminFetch<AdminScopeWithHolder[]>('/organization/admin-scopes'),
      ]);
      setScope(scopeResult);
      setUsers(usersResult);
      setGrants(grantsResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the admin roster');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function grant(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await adminFetch('/organization/admin-scopes', {
        method: 'POST',
        body: {
          userId: draft.userId,
          level: draft.level,
          retailBrandId: draft.level === 'ORG' ? undefined : draft.retailBrandId || undefined,
          branchNodeId: draft.level === 'BRANCH' ? draft.branchNodeId || undefined : undefined,
        },
      });
      setDraft(BLANK);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not grant that scope');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await adminFetch(`/organization/admin-scopes/${id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not revoke that grant');
    }
  }

  if (!scope) return <Loading />;

  const brandName = (id: string | null) => scope.brands.find((brand) => brand.id === id)?.name ?? id ?? '—';
  const branchLabel = (id: string | null) => scope.nodes.find((node) => node.id === id)?.label ?? id ?? '—';
  const holderName = (holder: AdminScopeWithHolder['user']) =>
    [holder.firstName, holder.lastName].filter(Boolean).join(' ') || holder.email || holder.id;

  return (
    <>
      <PageHeader
        title="Admin access"
        description="Who is a super admin, a brand admin, or a branch admin. What they may do once scoped is set from Team & Access."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="overflow-x-auto">
          {grants.length === 0 ? (
            <EmptyState title="No admin scope granted yet" description="Every deployment starts with none — grant the first one." />
          ) : (
            <table className="table-flat">
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Scope</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {grants.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="font-medium text-neutral-900">{holderName(row.user)}</span>
                      <p className="text-xs text-neutral-900/60">{row.user.email}</p>
                    </td>
                    <td className="text-neutral-900/70">
                      {row.level === 'ORG' && 'Super admin — every brand and branch'}
                      {row.level === 'BRAND' && `Brand admin — ${brandName(row.retailBrandId)}`}
                      {row.level === 'BRANCH' &&
                        `Branch admin — ${branchLabel(row.branchNodeId)} (${brandName(row.retailBrandId)})`}
                    </td>
                    <td className="text-end">
                      <button type="button" onClick={() => revoke(row.id)} className="btn-text text-feedback-negative">
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <form onSubmit={grant} className="space-y-4">
          <h2 className="eyebrow">Grant scope</h2>

          <div>
            <label className="field-label" htmlFor="grant-user">
              User
            </label>
            <select
              id="grant-user"
              required
              className="field-input"
              value={draft.userId}
              onChange={(event) => setDraft({ ...draft, userId: event.target.value })}
            >
              <option value="" disabled>
                Choose a user…
              </option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.phone}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="grant-level">
              Level
            </label>
            <select
              id="grant-level"
              className="field-input"
              value={draft.level}
              onChange={(event) => setDraft({ ...draft, level: event.target.value as Level })}
            >
              <option value="BRANCH">Branch admin</option>
              <option value="BRAND">Brand admin</option>
              <option value="ORG">Super admin (ORG)</option>
            </select>
          </div>

          {draft.level !== 'ORG' ? (
            <div>
              <label className="field-label" htmlFor="grant-brand">
                Brand
              </label>
              <select
                id="grant-brand"
                required
                className="field-input"
                value={draft.retailBrandId}
                onChange={(event) => setDraft({ ...draft, retailBrandId: event.target.value })}
              >
                <option value="" disabled>
                  Choose a brand…
                </option>
                {scope.brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {draft.level === 'BRANCH' ? (
            <div>
              <label className="field-label" htmlFor="grant-branch">
                Branch
              </label>
              <select
                id="grant-branch"
                required
                className="field-input"
                value={draft.branchNodeId}
                onChange={(event) => setDraft({ ...draft, branchNodeId: event.target.value })}
              >
                <option value="" disabled>
                  Choose a branch…
                </option>
                {scope.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Granting…' : 'Grant'}
          </button>
        </form>
      </div>
    </>
  );
}
