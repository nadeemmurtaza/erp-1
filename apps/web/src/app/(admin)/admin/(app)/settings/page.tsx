'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ADMIN_LOCKED_PERMISSIONS, BACK_OFFICE_ROLES, formatDateTime, type UserRole } from '@yaseen/shared';
import { adminFetch } from '@/lib/admin-client';
import type { AuditLogEntry, AuditLogPage, PermissionDefinition, RolePermissions } from '@/types/api';

type Draft = Record<UserRole, Set<string>>;

function draftFrom(roles: RolePermissions[]): Draft {
  const draft = {} as Draft;
  for (const role of BACK_OFFICE_ROLES) {
    draft[role] = new Set(roles.find((r) => r.role === role)?.permissions ?? []);
  }
  return draft;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((key) => b.has(key));
}

export default function AdminSettingsPage() {
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [roles, setRoles] = useState<RolePermissions[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savingRole, setSavingRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [audit, setAudit] = useState<AuditLogPage | null>(null);
  const [auditFilters, setAuditFilters] = useState({ entity: '', actorId: '', from: '', to: '' });
  const [auditPage, setAuditPage] = useState(1);
  const [auditError, setAuditError] = useState<string | null>(null);

  const loadPermissions = useCallback(async () => {
    setError(null);
    try {
      const [perms, roleGrants] = await Promise.all([
        adminFetch<PermissionDefinition[]>('/admin/settings/permissions'),
        adminFetch<RolePermissions[]>('/admin/settings/roles'),
      ]);
      setPermissions(perms);
      setRoles(roleGrants);
      setDraft(draftFrom(roleGrants));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load permissions');
    }
  }, []);

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  const loadAuditLog = useCallback(async () => {
    setAuditError(null);
    try {
      setAudit(
        await adminFetch<AuditLogPage>('/admin/settings/audit-log', {
          query: {
            entity: auditFilters.entity || undefined,
            actorId: auditFilters.actorId || undefined,
            from: auditFilters.from || undefined,
            to: auditFilters.to || undefined,
            page: auditPage,
            perPage: 50,
          },
        }),
      );
    } catch (cause) {
      setAuditError(cause instanceof Error ? cause.message : 'Could not load the audit log');
    }
  }, [auditFilters, auditPage]);

  useEffect(() => {
    void loadAuditLog();
  }, [loadAuditLog]);

  const categories = useMemo(() => {
    const seen = new Map<string, PermissionDefinition[]>();
    for (const permission of permissions) {
      const list = seen.get(permission.category) ?? [];
      list.push(permission);
      seen.set(permission.category, list);
    }
    return [...seen.entries()];
  }, [permissions]);

  function toggle(role: UserRole, key: string) {
    if (!draft) return;
    const next = { ...draft, [role]: new Set(draft[role]) };
    if (next[role].has(key)) next[role].delete(key);
    else next[role].add(key);
    setDraft(next);
  }

  function isDirty(role: UserRole): boolean {
    if (!draft) return false;
    const saved = roles.find((r) => r.role === role);
    return !sameSet(draft[role], new Set(saved?.permissions ?? []));
  }

  async function saveRole(role: UserRole) {
    if (!draft) return;
    setSavingRole(role);
    setError(null);
    try {
      const result = await adminFetch<RolePermissions>(`/admin/settings/roles/${role}/permissions`, {
        method: 'PUT',
        body: { permissionKeys: [...draft[role]] },
      });
      setRoles((prev) => prev.map((r) => (r.role === role ? result : r)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not save ${role}'s permissions`);
    } finally {
      setSavingRole(null);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Settings</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        What each role can do, and a record of every change made in the back office.
      </p>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-900/50">
          Roles &amp; Permissions
        </h2>

        {error ? (
          <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {!draft ? (
          <p className="text-sm text-neutral-900/50">Loading…</p>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-100 bg-neutral-50">
                  <tr>
                    <th className="px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
                      Permission
                    </th>
                    {BACK_OFFICE_ROLES.map((role) => (
                      <th
                        key={role}
                        className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-900/50"
                      >
                        {role}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white">
                  {categories.map(([category, items]) => (
                    <Fragment key={category}>
                      <tr className="bg-neutral-50/60">
                        <td colSpan={BACK_OFFICE_ROLES.length + 1} className="px-4 py-1.5 text-xs font-semibold text-neutral-900/60">
                          {category}
                        </td>
                      </tr>
                      {items.map((permission) => (
                        <tr key={permission.id}>
                          <td className="px-4 py-2.5">
                            <span className="text-neutral-900">{permission.label}</span>
                            <p className="text-xs text-neutral-900/40">{permission.key}</p>
                          </td>
                          {BACK_OFFICE_ROLES.map((role) => {
                            const locked =
                              role === 'ADMIN' &&
                              (ADMIN_LOCKED_PERMISSIONS as readonly string[]).includes(permission.key);
                            return (
                              <td key={role} className="px-4 py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={draft[role].has(permission.key)}
                                  disabled={locked}
                                  title={locked ? 'ADMIN must always keep this permission' : undefined}
                                  onChange={() => toggle(role, permission.key)}
                                  className="rounded border-neutral-200 text-accent-hover focus:ring-accent disabled:opacity-40"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 px-4 py-3">
              {BACK_OFFICE_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  disabled={!isDirty(role) || savingRole === role}
                  onClick={() => void saveRole(role)}
                  className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingRole === role ? `Saving ${role}…` : `Save ${role}`}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-900/50">Audit Log</h2>

        <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
          <label className="block">
            <span className="field-label">Entity</span>
            <input
              value={auditFilters.entity}
              onChange={(event) => setAuditFilters({ ...auditFilters, entity: event.target.value })}
              placeholder="Order, Product…"
              className="field-input w-auto"
            />
          </label>
          <label className="block">
            <span className="field-label">Actor ID</span>
            <input
              value={auditFilters.actorId}
              onChange={(event) => setAuditFilters({ ...auditFilters, actorId: event.target.value })}
              className="field-input w-auto"
            />
          </label>
          <label className="block">
            <span className="field-label">From</span>
            <input
              type="date"
              value={auditFilters.from}
              onChange={(event) => setAuditFilters({ ...auditFilters, from: event.target.value })}
              className="field-input w-auto"
            />
          </label>
          <label className="block">
            <span className="field-label">To</span>
            <input
              type="date"
              value={auditFilters.to}
              onChange={(event) => setAuditFilters({ ...auditFilters, to: event.target.value })}
              className="field-input w-auto"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setAuditPage(1);
              void loadAuditLog();
            }}
            className="btn-ghost"
          >
            Filter
          </button>
        </div>

        {auditError ? (
          <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
            {auditError}
          </p>
        ) : null}

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50">
                <tr>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white">
                {!audit ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-neutral-900/50">
                      Loading…
                    </td>
                  </tr>
                ) : audit.entries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-neutral-900/50">
                      No matching entries.
                    </td>
                  </tr>
                ) : (
                  audit.entries.map((entry) => <AuditRow key={entry.id} entry={entry} />)
                )}
              </tbody>
            </table>
          </div>

          {audit && audit.total > audit.perPage ? (
            <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm text-neutral-900/60">
              <span>
                {(audit.page - 1) * audit.perPage + 1}–
                {Math.min(audit.page * audit.perPage, audit.total)} of {audit.total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={audit.page <= 1}
                  onClick={() => setAuditPage((page) => Math.max(1, page - 1))}
                  className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={audit.page * audit.perPage >= audit.total}
                  onClick={() => setAuditPage((page) => page + 1)}
                  className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
      {children}
    </th>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const actorName = entry.actor
    ? [entry.actor.firstName, entry.actor.lastName].filter(Boolean).join(' ') || entry.actor.email
    : '—';

  return (
    <tr className="hover:bg-neutral-50">
      <td className="px-4 py-3 text-neutral-900/70">{formatDateTime(entry.createdAt)}</td>
      <td className="px-4 py-3 text-neutral-900">{actorName}</td>
      <td className="px-4 py-3 font-mono text-xs text-neutral-900/80">{entry.action}</td>
      <td className="px-4 py-3 text-neutral-900/70">
        {entry.entity}
        {entry.entityId ? <span className="text-xs text-neutral-900/40"> · {entry.entityId}</span> : null}
      </td>
    </tr>
  );
}
