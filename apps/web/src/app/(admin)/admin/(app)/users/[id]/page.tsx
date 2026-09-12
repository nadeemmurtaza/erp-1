'use client';

import { Fragment, use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import type { AdminUserDetail, BackOfficeRole, PermissionDefinition, PermissionOverride } from '@/types/api';
import { Loading } from '@/components/ui';

const ADMIN_LOCKED = new Set(['settings.manage', 'roles.manage_permissions']);

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const self = useMemo(() => getStoredUser(), []);
  const isSelf = self?.id === id;

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [overrides, setOverrides] = useState<PermissionOverride[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      const [detail, catalog] = await Promise.all([
        adminFetch<AdminUserDetail>(`/admin/users/${id}`),
        adminFetch<PermissionDefinition[]>('/admin/settings/permissions'),
      ]);
      setUser(detail);
      setPermissions(catalog);
      setOverrides(detail.overrides);
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

  const roleDefaults = useMemo(() => new Set(user?.roleDefaultPermissions ?? []), [user]);

  const effective = useMemo(() => {
    const set = new Set(roleDefaults);
    for (const o of overrides) {
      if (o.effect === 'GRANT') set.add(o.key);
      else set.delete(o.key);
    }
    return set;
  }, [roleDefaults, overrides]);

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
      <p role="alert" className="card p-4 text-sm text-red-700">
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
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
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

          <label className="block">
            <span className="field-label">Role</span>
            <select
              value={profileDraft.role}
              disabled={isSelf}
              onChange={(event) =>
                setProfileDraft({ ...profileDraft, role: event.target.value as BackOfficeRole })
              }
              className="field-input disabled:opacity-50"
            >
              <option value="STAFF">Staff</option>
              <option value="TAILOR">Tailor</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>

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
            <p className="text-xs text-neutral-900/50">
              You can&rsquo;t change your own role or active status here — ask another admin.
            </p>
          ) : null}

          <button type="submit" disabled={profileSaving} className="btn-primary">
            {profileSaving ? 'Saving…' : 'Save profile'}
          </button>
        </form>

        <form onSubmit={resetPassword} className="card h-fit space-y-4 p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Reset password</h2>
          <p className="text-xs text-neutral-900/50">
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
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Permissions</h2>
            <p className="text-xs text-neutral-900/50">
              Checked by default from the {user.role} role. Toggle a row to override it just for
              this person.
            </p>
          </div>
          <button type="button" disabled={saving} onClick={() => void savePermissions()} className="btn-primary">
            {saving ? 'Saving…' : 'Save permissions'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-white">
              {categories.map(([category, items]) => (
                <Fragment key={category}>
                  <tr className="bg-neutral-50/60">
                    <td colSpan={3} className="px-4 py-1.5 text-xs font-semibold text-neutral-900/60">
                      {category}
                    </td>
                  </tr>
                  {items.map((permission) => {
                    const locked = user.role === 'ADMIN' && ADMIN_LOCKED.has(permission.key);
                    const overrideEffect = overrideByKey.get(permission.key);
                    return (
                      <tr key={permission.id}>
                        <td className="w-10 px-4 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={effective.has(permission.key)}
                            disabled={locked}
                            title={locked ? 'ADMIN must always keep this permission' : undefined}
                            onChange={() => toggle(permission.key)}
                            className="field-check disabled:opacity-40"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-neutral-900">{permission.label}</span>
                          <p className="text-xs text-neutral-900/40">{permission.key}</p>
                        </td>
                        <td className="px-4 py-2.5 text-end text-xs">
                          {overrideEffect === 'GRANT' ? (
                            <span className="font-medium text-green-700">granted (override)</span>
                          ) : overrideEffect === 'REVOKE' ? (
                            <span className="font-medium text-red-700">revoked (override)</span>
                          ) : (
                            <span className="text-neutral-900/40">role default</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
