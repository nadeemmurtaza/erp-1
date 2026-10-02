'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import type { AdminUser, BackOfficeRole, RoleSummary } from '@/types/api';
import { DataTable } from '@/components/ui';
import { Select } from '@/components/ui/select';

interface Draft {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  password: string;
  role: BackOfficeRole;
  roleIds: Set<string>;
}

const BLANK: Draft = {
  email: '',
  phone: '',
  firstName: '',
  lastName: '',
  password: '',
  role: 'STAFF',
  roleIds: new Set(),
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allRoles, setAllRoles] = useState<RoleSummary[]>([]);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fetchedUsers, fetchedRoles] = await Promise.all([
        adminFetch<AdminUser[]>('/admin/users'),
        adminFetch<RoleSummary[]>('/admin/roles'),
      ]);
      setUsers(fetchedUsers);
      setAllRoles(fetchedRoles);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load users');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleDraftRole(roleId: string) {
    setDraft((prev) => {
      const roleIds = new Set(prev.roleIds);
      if (roleIds.has(roleId)) roleIds.delete(roleId);
      else roleIds.add(roleId);
      return { ...prev, roleIds };
    });
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await adminFetch('/admin/users', {
        method: 'POST',
        body: {
          email: draft.email,
          phone: draft.phone || undefined,
          firstName: draft.firstName || undefined,
          lastName: draft.lastName || undefined,
          password: draft.password,
          role: draft.role,
          roleIds: draft.roleIds.size > 0 ? [...draft.roleIds] : undefined,
        },
      });
      setDraft(BLANK);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the user');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Team & Access</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Back-office accounts — staff, tailors and admins. Permissions come from each user&rsquo;s
        role, editable in bulk from Settings or per-person from their profile here.
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="overflow-hidden">
          <DataTable
            rows={users}
            emptyLabel="No back-office users yet."
            rowKey={(user) => user.id}
            columns={[
              {
                header: 'Name',
                cell: (user) => (
                  <>
                    <span className="font-medium text-neutral-900">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.phone}
                    </span>
                    <p className="text-xs text-neutral-900/60">{user.email ?? user.phone}</p>
                  </>
                ),
              },
              { header: 'Role', cell: (user) => user.role, muted: true },
              {
                header: 'Status',
                cell: (user) =>
                  user.isActive ? (
                    <span className="text-xs font-medium text-green-700">Active</span>
                  ) : (
                    <span className="text-xs font-medium text-red-700">Deactivated</span>
                  ),
              },
              {
                header: '',
                align: 'end',
                cell: (user) => (
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="rounded px-2 py-1 text-xs text-accent-hover hover:bg-neutral-50"
                  >
                    Manage
                  </Link>
                ),
              },
            ]}
          />
        </div>

        <form onSubmit={create} className="card h-fit space-y-4 p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Add a user</h2>

          <label className="block">
            <span className="field-label">First name</span>
            <input
              value={draft.firstName}
              onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
              className="field-input"
            />
          </label>

          <label className="block">
            <span className="field-label">Last name</span>
            <input
              value={draft.lastName}
              onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
              className="field-input"
            />
          </label>

          <label className="block">
            <span className="field-label">Email</span>
            <input
              type="email"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              required
              className="field-input"
            />
          </label>

          <label className="block">
            <span className="field-label">Phone</span>
            <input
              value={draft.phone}
              onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
              className="field-input"
            />
          </label>

          <div>
            <span className="field-label">Role</span>
            <Select
              label="Role"
              value={draft.role}
              onChange={(next) => setDraft({ ...draft, role: next as BackOfficeRole })}
              options={[
                { value: 'STAFF', label: 'Staff' },
                { value: 'TAILOR', label: 'Tailor' },
                { value: 'ADMIN', label: 'Admin' },
              ]}
            />
          </div>

          <label className="block">
            <span className="field-label">Password</span>
            <input
              type="password"
              value={draft.password}
              onChange={(event) => setDraft({ ...draft, password: event.target.value })}
              required
              minLength={8}
              className="field-input"
            />
          </label>

          {allRoles.length > 0 ? (
            <div>
              <span className="field-label">Custom roles</span>
              <p className="mb-1 text-xs text-neutral-900/60">
                Separate from the account kind above — a person may hold several; permissions are
                the union of every one checked.
              </p>
              <ul className="max-h-40 overflow-y-auto rounded bg-neutral-50/60">
                {allRoles.map((role) => (
                  <li key={role.id} className="px-3 py-1.5">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.roleIds.has(role.id)}
                        onChange={() => toggleDraftRole(role.id)}
                        className="field-check"
                      />
                      <span className="min-w-0 truncate">{role.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Creating…' : 'Add user'}
          </button>
        </form>
      </div>
    </>
  );
}
