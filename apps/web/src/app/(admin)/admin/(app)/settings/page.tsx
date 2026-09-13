'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ADMIN_LOCKED_PERMISSIONS, BACK_OFFICE_ROLES, formatDateTime, type UserRole } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import type { AuditLogEntry, AuditLogPage, PermissionDefinition, RolePermissions } from '@/types/api';
import { Loading, PageHeader, Tabs } from '@/components/ui';

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
      <PageHeader
        title="Settings"
        description="What each role can do, how media is stored, and a record of every change."
      />

      {/*
        Three unrelated jobs — who can do what, how uploads are stored, what
        happened. Tabs rather than one scroll: they are separate tasks on one
        object, and stacking them is how a settings page becomes the longest
        page in an admin.
      */}
      <Tabs
        label="Settings areas"
        items={[
          {
            key: 'permissions',
            label: 'Roles & permissions',
            content: (
      <section>

        {error ? (
          <p role="alert" className="notice notice-error mb-4">
            {error}
          </p>
        ) : null}

        {!draft ? (
          <Loading />
        ) : (
          <div className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-flat">
                <thead>
                  <tr>
                    <th>
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
                <tbody className="divide-y divide-neutral-100">
                  {categories.map(([category, items]) => (
                    <Fragment key={category}>
                      <tr className="bg-neutral-50/60">
                        <td colSpan={BACK_OFFICE_ROLES.length + 1} className="px-4 py-1.5 text-xs font-semibold text-neutral-900/60">
                          {category}
                        </td>
                      </tr>
                      {items.map((permission) => (
                        <tr key={permission.id}>
                          <td className="py-2.5">
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
                                  className="field-check disabled:opacity-40"
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
            ),
          },
          {
            key: 'media',
            label: 'Media',
            content: <MediaSettings />,
          },
          {
            key: 'audit',
            label: 'Audit log',
            content: (
      <section>

        <div className="mb-6 flex flex-wrap items-end gap-3 border-b border-neutral-100 pb-4">
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
            className="btn-secondary"
          >
            Filter
          </button>
        </div>

        {auditError ? (
          <p role="alert" className="notice notice-error mb-4">
            {auditError}
          </p>
        ) : null}

        <div className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-flat">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {!audit ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center">
                    <Loading className="p-0" />
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
            ),
          },
        ]}
      />
    </>
  );
}

/**
 * How uploaded images are stored.
 *
 * One switch, and a plain statement of what it does — an owner turning this
 * off should know it costs page speed, and that it changes nothing about the
 * images already on the shelf.
 */
function MediaSettings() {
  const [webpEnabled, setWebpEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ webpEnabled: boolean }>('/admin/settings/media')
      .then((media) => setWebpEnabled(media.webpEnabled))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load media settings'),
      );
  }, []);

  async function save(next: boolean) {
    setSaving(true);
    setError(null);
    setNotice(null);
    // Optimistic, then corrected by what the server returns — a switch that
    // waits a round trip before moving feels broken.
    setWebpEnabled(next);
    try {
      const media = await adminFetch<{ webpEnabled: boolean }>('/admin/settings/media', {
        method: 'PUT',
        body: { webpEnabled: next },
      });
      setWebpEnabled(media.webpEnabled);
      setNotice(
        media.webpEnabled
          ? 'New uploads will be converted to WebP.'
          : 'New uploads will be stored in their original format.',
      );
    } catch (cause) {
      setWebpEnabled(!next);
      setError(cause instanceof Error ? cause.message : 'Could not save media settings');
    } finally {
      setSaving(false);
    }
  }

  if (webpEnabled === null) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading />
    );
  }

  return (
    <section className="max-w-prose">
      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}
      {notice ? <p className="notice notice-success mb-4">{notice}</p> : null}

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={webpEnabled}
          disabled={saving}
          onChange={(event) => void save(event.target.checked)}
          className="field-check mt-1"
        />
        <span>
          <span className="block text-sm font-medium text-neutral-900">
            Convert uploads to WebP
          </span>
          <span className="mt-1 block text-sm text-neutral-900/60">
            WebP is smaller than JPEG or PNG at the same visual quality, so pages load faster and
            Lighthouse stops flagging &ldquo;next-gen formats&rdquo;. Turn it off only if an
            original has to be kept byte-for-byte.
          </span>
          <span className="mt-2 block text-xs text-neutral-900/45">
            Applies to new uploads. Images already stored keep the format they were saved in.
          </span>
        </span>
      </label>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th>
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
      <td className="text-neutral-900/70">{formatDateTime(entry.createdAt)}</td>
      <td className="text-neutral-900">{actorName}</td>
      <td className="font-mono text-neutral-900/80">{entry.action}</td>
      <td className="text-neutral-900/70">
        {entry.entity}
        {entry.entityId ? <span className="text-xs text-neutral-900/40"> · {entry.entityId}</span> : null}
      </td>
    </tr>
  );
}
