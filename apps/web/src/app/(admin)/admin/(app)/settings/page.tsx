'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { formatDateTime } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import type { AuditLogEntry, AuditLogPage, PermissionDefinition, RoleSummary, RoleWriteResult } from '@/types/api';
import { Loading, PageHeader, Tabs } from '@/components/ui';

const BLANK_DRAFT = { id: null as string | null, name: '', description: '', permissions: new Set<string>() };

export default function AdminSettingsPage() {
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [draft, setDraft] = useState(BLANK_DRAFT);
  const [saving, setSaving] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [audit, setAudit] = useState<AuditLogPage | null>(null);
  const [auditFilters, setAuditFilters] = useState({ entity: '', actorId: '', from: '', to: '' });
  const [auditPage, setAuditPage] = useState(1);
  const [auditError, setAuditError] = useState<string | null>(null);

  const loadPermissions = useCallback(async () => {
    setError(null);
    try {
      const [perms, roleList] = await Promise.all([
        adminFetch<PermissionDefinition[]>('/admin/settings/permissions'),
        adminFetch<RoleSummary[]>('/admin/roles'),
      ]);
      setPermissions(perms);
      setRoles(roleList);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load roles');
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

  function toggle(key: string) {
    const next = new Set(draft.permissions);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDraft({ ...draft, permissions: next });
  }

  function editRole(role: RoleSummary) {
    setDuplicateNotice(null);
    setDraft({ id: role.id, name: role.name, description: role.description ?? '', permissions: new Set(role.permissions) });
  }

  function newRole() {
    setDuplicateNotice(null);
    setDraft(BLANK_DRAFT);
  }

  async function saveRole(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setDuplicateNotice(null);
    try {
      const body = {
        name: draft.name,
        description: draft.description || undefined,
        permissions: [...draft.permissions],
      };
      const result = draft.id
        ? await adminFetch<RoleWriteResult>(`/admin/roles/${draft.id}`, { method: 'PATCH', body })
        : await adminFetch<RoleWriteResult>('/admin/roles', { method: 'POST', body });

      setRoles((prev) => {
        const exists = prev.some((r) => r.id === result.role.id);
        return exists ? prev.map((r) => (r.id === result.role.id ? result.role : r)) : [...prev, result.role];
      });
      setDraft({ id: result.role.id, name: result.role.name, description: result.role.description ?? '', permissions: new Set(result.role.permissions) });

      if (result.duplicateOfRoleName) {
        setDuplicateNotice(
          `"${result.duplicateOfRoleName}" already grants exactly this set of permissions — ` +
            'consider assigning that role instead of keeping two that do the same thing.',
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this role');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(role: RoleSummary) {
    setError(null);
    try {
      await adminFetch(`/admin/roles/${role.id}`, { method: 'DELETE' });
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      if (draft.id === role.id) newRole();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not delete "${role.name}"`);
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

        {permissions.length === 0 ? (
          <Loading />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_26rem]">
            <div className="overflow-x-auto">
              <table className="table-flat">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th className="text-end">Permissions</th>
                    <th className="text-end">Holders</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {roles.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-neutral-900/50">
                        No roles yet.
                      </td>
                    </tr>
                  ) : (
                    roles.map((role) => (
                      <tr key={role.id} className="hover:bg-neutral-50">
                        <td>
                          <button type="button" onClick={() => editRole(role)} className="font-medium text-accent-hover">
                            {role.name}
                          </button>
                          {role.description ? (
                            <p className="text-xs text-neutral-900/40">{role.description}</p>
                          ) : null}
                        </td>
                        <td className="text-end tabular-nums text-neutral-900/70">{role.permissions.length}</td>
                        <td className="text-end tabular-nums text-neutral-900/70">{role.userCount}</td>
                        <td className="text-end">
                          <button
                            type="button"
                            onClick={() => void deleteRole(role)}
                            className="btn-text text-feedback-negative"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <form onSubmit={saveRole} className="space-y-4">
              <div className="flex items-baseline justify-between">
                <h2 className="eyebrow">{draft.id ? 'Edit role' : 'New role'}</h2>
                {draft.id ? (
                  <button type="button" onClick={newRole} className="btn-text">
                    New role instead
                  </button>
                ) : null}
              </div>

              {duplicateNotice ? <p className="notice notice-info">{duplicateNotice}</p> : null}

              <label className="block">
                <span className="field-label">Name</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  required
                  className="field-input"
                />
              </label>

              <label className="block">
                <span className="field-label">Description</span>
                <input
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  className="field-input"
                />
              </label>

              <div>
                <span className="field-label">Permissions</span>
                <div className="max-h-96 overflow-y-auto rounded border border-neutral-100">
                  {categories.map(([category, items]) => (
                    <Fragment key={category}>
                      <p className="bg-neutral-50/60 px-3 py-1.5 text-xs font-semibold text-neutral-900/60">
                        {category}
                      </p>
                      {items.map((permission) => (
                        <label key={permission.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={draft.permissions.has(permission.key)}
                            onChange={() => toggle(permission.key)}
                            className="field-check"
                          />
                          {permission.label}
                        </label>
                      ))}
                    </Fragment>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? 'Saving…' : draft.id ? 'Save role' : 'Create role'}
              </button>
            </form>
          </div>
        )}
      </section>
            ),
          },
          {
            key: 'documents',
            label: 'Documents & media',
            content: (
              <>
                <DocumentSettingsPanel />
                <MediaSettings />
              </>
            ),
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

interface DocumentSettings {
  logoSource: 'text' | 'site' | 'custom';
  logoUrl: string | null;
  prefixes: Record<string, string>;
}

const PREFIX_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'order', label: 'Orders' },
  { key: 'purchaseOrder', label: 'Purchase orders' },
  { key: 'goodsReceipt', label: 'Goods receipts' },
  { key: 'stitchingOrder', label: 'Stitching orders' },
  { key: 'stitchingJob', label: 'Workshop jobs' },
  { key: 'stockCount', label: 'Stock counts' },
  { key: 'journalEntry', label: 'Journal entries' },
];

const LOGO_CHOICES: Array<{ value: DocumentSettings['logoSource']; label: string; hint: string }> = [
  {
    value: 'text',
    label: 'The shop name, as text',
    hint: 'What most people see. Mail clients block hosted images until the reader asks for them.',
  },
  {
    value: 'site',
    label: "The storefront's logo",
    hint: 'The same artwork the website header uses.',
  },
  {
    value: 'custom',
    label: 'A logo just for documents',
    hint: 'For when the web logo is knocked out white and an invoice needs a dark one.',
  },
];

/**
 * What customer-facing paperwork shows, and how it is numbered.
 *
 * Prefixes are here rather than in code because a shop that already numbers
 * its paperwork a particular way should not have to match ours — and because
 * the shipped default for orders is the client's initials, which the next
 * client will want changed. Changing one affects new documents only.
 */
function DocumentSettingsPanel() {
  const [settings, setSettings] = useState<DocumentSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<DocumentSettings>('/admin/settings/documents')
      .then(setSettings)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load document settings'),
      );
  }, []);

  async function save(patch: Partial<DocumentSettings>) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await adminFetch<DocumentSettings>('/admin/settings/documents', {
        method: 'PUT',
        body: patch,
      });
      setSettings(next);
      setNotice('Saved. New documents use these; anything already issued keeps its number.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save document settings');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading />
    );
  }

  return (
    <section className="mb-10 max-w-prose">
      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}
      {notice ? <p className="notice notice-success mb-4">{notice}</p> : null}

      <h3 className="eyebrow mb-3">On receipts, invoices and emails</h3>
      <div className="space-y-3">
        {LOGO_CHOICES.map((choice) => (
          <label key={choice.value} className="flex items-start gap-3">
            <input
              type="radio"
              name="logoSource"
              checked={settings.logoSource === choice.value}
              disabled={saving}
              onChange={() => void save({ logoSource: choice.value })}
              className="field-check mt-1 rounded-full"
            />
            <span>
              <span className="block text-sm text-neutral-900">{choice.label}</span>
              <span className="mt-0.5 block text-xs text-neutral-900/50">{choice.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {settings.logoSource === 'custom' ? (
        <label className="mt-4 block">
          <span className="field-label">Logo URL</span>
          <input
            defaultValue={settings.logoUrl ?? ''}
            onBlur={(event) => {
              const next = event.target.value.trim() || null;
              if (next !== settings.logoUrl) void save({ logoUrl: next });
            }}
            placeholder="https://…"
            className="field-input"
          />
          <span className="mt-1 block text-xs text-neutral-900/50">
            Upload it under Products &rsaquo; Images, then paste the address here. A wide,
            short mark reads best — it is shown 36px tall.
          </span>
        </label>
      ) : null}

      <h3 className="eyebrow mb-3 mt-8">Number prefixes</h3>
      <p className="mb-3 text-sm text-neutral-900/60">
        What each kind of document&rsquo;s number starts with, before the year and the
        sequence — <code className="text-neutral-900">{settings.prefixes.order}-2026-0001</code>.
      </p>
      <div className="grid gap-3 fold:grid-cols-2">
        {PREFIX_FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="field-label">{field.label}</span>
            <input
              defaultValue={settings.prefixes[field.key] ?? ''}
              maxLength={8}
              onBlur={(event) => {
                const next = event.target.value.trim().toUpperCase();
                if (next && next !== settings.prefixes[field.key]) {
                  void save({ prefixes: { [field.key]: next } as Record<string, string> });
                }
              }}
              className="field-input"
            />
          </label>
        ))}
      </div>
    </section>
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
