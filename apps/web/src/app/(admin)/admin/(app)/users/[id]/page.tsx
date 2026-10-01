'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import type {
  AdminUserDetail,
  BackOfficeRole,
  PermissionDefinition,
  PermissionOverride,
  RoleSummary,
} from '@/types/api';
import { DataTable, Loading } from '@/components/ui';
import { Select } from '@/components/ui/select';

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const self = useMemo(() => getStoredUser(), []);
  const isSelf = self?.id === id;

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [overrides, setOverrides] = useState<PermissionOverride[]>([]);
  const [allRoles, setAllRoles] = useState<RoleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);

  const [profileDraft, setProfileDraft] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'STAFF' as BackOfficeRole,
    isActive: true,
  });
  const [profileSaving, setProfileSaving] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [detail, catalog, roles] = await Promise.all([
        adminFetch<AdminUserDetail>(`/admin/users/${id}`),
        adminFetch<PermissionDefinition[]>('/admin/settings/permissions'),
        adminFetch<RoleSummary[]>('/admin/roles'),
      ]);
      setUser(detail);
      setPermissions(catalog);
      setOverrides(detail.overrides);
      setAllRoles(roles);
      setProfileDraft({
        firstName: detail.firstName ?? '',
        lastName: detail.lastName ?? '',
        email: detail.email ?? '',
        phone: detail.phone ?? '',
        role: detail.role,
        isActive: detail.isActive,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this user');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Union of every held Role's own grants — a user may hold several.
  const roleDefaults = useMemo(
    () => new Set(user?.roles.flatMap((role) => role.permissions) ?? []),
    [user],
  );

  const effective = useMemo(() => {
    const set = new Set(roleDefaults);
    for (const o of overrides) {
      if (o.effect === 'GRANT') set.add(o.key);
      else set.delete(o.key);
    }
    return set;
  }, [roleDefaults, overrides]);

  // Grouped by category, and made contiguous by category (DataTable's
  // `groupBy` renders a header whenever the key changes between
  // consecutive rows, so a permission's category must not skip around).
  const groupedPermissions = useMemo(() => {
    const seen = new Map<string, PermissionDefinition[]>();
    for (const permission of permissions) {
      const list = seen.get(permission.category) ?? [];
      list.push(permission);
      seen.set(permission.category, list);
    }
    return [...seen.values()].flat();
  }, [permissions]);

  function toggle(key: string) {
    const wantsChecked = !effective.has(key);
    const isRoleDefault = roleDefaults.has(key);

    if (wantsChecked === isRoleDefault) {
      // Back to matching the role's own grant — no override needed.
      setOverrides((prev) => prev.filter((o) => o.key !== key));
    } else {
      const effect = wantsChecked ? 'GRANT' : 'REVOKE';
      setOverrides((prev) => [...prev.filter((o) => o.key !== key), { key, effect }]);
    }
  }

  const overrideByKey = useMemo(() => new Map(overrides.map((o) => [o.key, o.effect])), [overrides]);

  async function savePermissions() {
    setSaving(true);
    setError(null);
    try {
      const updated = await adminFetch<AdminUserDetail>(`/admin/users/${id}/permissions`, {
        method: 'PUT',
        body: { overrides },
      });
      setUser(updated);
      setOverrides(updated.overrides);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save permissions');
    } finally {
      setSaving(false);
    }
  }

  async function assignRole(roleId: string) {
    setRoleBusy(roleId);
    setError(null);
    try {
      const updated = await adminFetch<AdminUserDetail>(`/admin/users/${id}/roles/${roleId}`, {
        method: 'POST',
      });
      setUser(updated);
      setOverrides(updated.overrides);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not assign that role');
    } finally {
      setRoleBusy(null);
    }
  }

  async function unassignRole(roleId: string) {
    setRoleBusy(roleId);
    setError(null);
    try {
      const updated = await adminFetch<AdminUserDetail>(`/admin/users/${id}/roles/${roleId}`, {
        method: 'DELETE',
      });
      setUser(updated);
      setOverrides(updated.overrides);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove that role');
    } finally {
      setRoleBusy(null);
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileSaving(true);
    setError(null);
    try {
      await adminFetch(`/admin/users/${id}`, {
        method: 'PATCH',
        body: {
          firstName: profileDraft.firstName || undefined,
          lastName: profileDraft.lastName || undefined,
          email: profileDraft.email || undefined,
          phone: profileDraft.phone,
          ...(isSelf ? {} : { role: profileDraft.role, isActive: profileDraft.isActive }),
        },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this user');
    } finally {
      setProfileSaving(false);
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    setResetting(true);
    setResetMessage(null);
    setError(null);
    try {
      await adminFetch(`/admin/users/${id}/reset-password`, {
        method: 'POST',
        body: { newPassword },
      });
      setNewPassword('');
      setResetMessage('Password reset. They have been signed out of every device.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reset the password');
    } finally {
      setResetting(false);
    }
  }

  if (!user) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => router.push('/admin/users')}
        className="mb-4 text-sm text-neutral-900/60 hover:text-neutral-900"
      >
        ← Team & Access
      </button>

      <h1 className="mb-1 text-xl font-semibold text-neutral-900">
        {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.phone}
      </h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        {user.role} · {user.isActive ? 'Active' : 'Deactivated'}
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 fold:grid-cols-2">
        <form onSubmit={saveProfile} className="card h-fit space-y-4 p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Profile</h2>

          <label className="block">
            <span className="field-label">First name</span>
            <input
              value={profileDraft.firstName}
              onChange={(event) => setProfileDraft({ ...profileDraft, firstName: event.target.value })}
              className="field-input"
            />
          </label>

          <label className="block">
            <span className="field-label">Last name</span>
            <input
              value={profileDraft.lastName}
              onChange={(event) => setProfileDraft({ ...profileDraft, lastName: event.target.value })}
              className="field-input"
            />
          </label>

          <label className="block">
            <span className="field-label">Email</span>
            <input
              type="email"
              value={profileDraft.email}
              onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })}
              className="field-input"
            />
          </label>

          <label className="block">
            <span className="field-label">Phone</span>
            <input
              value={profileDraft.phone}
              onChange={(event) => setProfileDraft({ ...profileDraft, phone: event.target.value })}
              className="field-input"
            />
          </label>

          <div>
            <span className="field-label">Role</span>
            <Select
              label="Role"
              value={profileDraft.role}
              disabled={isSelf}
              onChange={(next) => setProfileDraft({ ...profileDraft, role: next as BackOfficeRole })}
              options={[
                { value: 'STAFF', label: 'Staff' },
                { value: 'TAILOR', label: 'Tailor' },
                { value: 'ADMIN', label: 'Admin' },
              ]}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={profileDraft.isActive}
              disabled={isSelf}
              onChange={(event) => setProfileDraft({ ...profileDraft, isActive: event.target.checked })}
              className="field-check"
            />
            Active
          </label>

          {isSelf ? (
            <p className="text-xs text-neutral-900/60">
              You can&rsquo;t change your own role or active status here — ask another admin.
            </p>
          ) : null}

          <button type="submit" disabled={profileSaving} className="btn-primary">
            {profileSaving ? 'Saving…' : 'Save profile'}
          </button>
        </form>

        <form onSubmit={resetPassword} className="card h-fit space-y-4 p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Reset password</h2>
          <p className="text-xs text-neutral-900/60">
            Sets their password directly and signs them out of every device.
          </p>

          <label className="block">
            <span className="field-label">New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
              className="field-input"
            />
          </label>

          {resetMessage ? <p className="text-sm text-green-700">{resetMessage}</p> : null}

          <button type="submit" disabled={resetting} className="btn-primary">
            {resetting ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      </div>

      <div className="mt-6 card overflow-hidden">
        <div className="border-b border-neutral-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Custom roles</h2>
          <p className="text-xs text-neutral-900/60">
            A person may hold several — their permissions are the union of every one checked below.
          </p>
        </div>

        <ul className="divide-y divide-neutral-100">
          {allRoles.map((role) => {
            const held = user.roles.some((r) => r.id === role.id);
            return (
              <li key={role.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <label className="flex min-w-0 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={held}
                    disabled={roleBusy === role.id}
                    onChange={() => void (held ? unassignRole(role.id) : assignRole(role.id))}
                    className="field-check disabled:opacity-40"
                  />
                  <span className="min-w-0">
                    <span className="text-neutral-900">{role.name}</span>
                    <span className="ms-2 text-xs text-neutral-900/60">
                      {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'} · {role.userCount}{' '}
                      holder{role.userCount === 1 ? '' : 's'}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {user.conflicts.redundantGrants.length > 0 || user.conflicts.overriddenRevokes.length > 0 ? (
        <div className="notice notice-info mt-6">
          {user.conflicts.redundantGrants.length > 0 ? (
            <p>
              Already granted by a held role, so this personal grant does nothing:{' '}
              {user.conflicts.redundantGrants.join(', ')}. Safe to remove below.
            </p>
          ) : null}
          {user.conflicts.overriddenRevokes.length > 0 ? (
            <p>
              A held role grants this, so the revoke below has no effect while that role stays
              assigned: {user.conflicts.overriddenRevokes.join(', ')}.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 card overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Permissions</h2>
            <p className="text-xs text-neutral-900/60">
              Checked by default from their held role(s). Toggle a row to override it just for this
              person.
            </p>
          </div>
          <button type="button" disabled={saving} onClick={() => void savePermissions()} className="btn-primary">
            {saving ? 'Saving…' : 'Save permissions'}
          </button>
        </div>

        <DataTable
          rows={groupedPermissions}
          rowKey={(permission) => permission.id}
          groupBy={(permission) => permission.category}
          renderGroupHeader={(category) => category}
          columns={[
            {
              header: '',
              className: 'w-10 text-center',
              cell: (permission) => (
                <input
                  type="checkbox"
                  checked={effective.has(permission.key)}
                  onChange={() => toggle(permission.key)}
                  className="field-check"
                />
              ),
            },
            {
              header: 'Permission',
              cell: (permission) => (
                <>
                  <span className="text-neutral-900">{permission.label}</span>
                  <p className="text-xs text-neutral-900/60">{permission.key}</p>
                </>
              ),
            },
            {
              header: 'Status',
              align: 'end',
              cell: (permission) => {
                const overrideEffect = overrideByKey.get(permission.key);
                return overrideEffect === 'GRANT' ? (
                  <span className="font-medium text-green-700">granted (override)</span>
                ) : overrideEffect === 'REVOKE' ? (
                  <span className="font-medium text-red-700">revoked (override)</span>
                ) : (
                  <span className="text-neutral-900/60">role default</span>
                );
              },
            },
          ]}
        />
      </div>
    </>
  );
}
