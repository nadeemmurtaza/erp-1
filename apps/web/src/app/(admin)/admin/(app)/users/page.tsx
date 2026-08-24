'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import type { AdminUser, BackOfficeRole } from '@/lib/api-types';

interface Draft {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  password: string;
  role: BackOfficeRole;
}

const BLANK: Draft = {
  email: '',
  phone: '',
  firstName: '',
  lastName: '',
  password: '',
  role: 'STAFF',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await adminFetch<AdminUser[]>('/admin/users'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load users');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      <h1 className="mb-1 text-xl font-semibold text-ink">Team & Access</h1>
      <p className="mb-6 text-sm text-ink/60">
        Back-office accounts — staff, tailors and admins. Permissions come from each user&rsquo;s
        role, editable in bulk from Settings or per-person from their profile here.
      </p>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-sand-200 bg-sand-50">
                <tr>
                  <th className="px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-ink/50">
                    Name
                  </th>
                  <th className="px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-ink/50">
                    Role
                  </th>
                  <th className="px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-ink/50">
                    Status
                  </th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-ink/50">
                      No back-office users yet.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-sand-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink">
                          {[user.firstName, user.lastName].filter(Boolean).join(' ') ||
                            user.email ||
                            user.phone}
                        </span>
                        <p className="text-xs text-ink/40">{user.email ?? user.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-ink/70">{user.role}</td>
                      <td className="px-4 py-3">
                        {user.isActive ? (
                          <span className="text-xs font-medium text-green-700">Active</span>
                        ) : (
                          <span className="text-xs font-medium text-red-700">Deactivated</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <form onSubmit={create} className="card h-fit space-y-4 p-4">
          <h2 className="text-sm font-semibold text-ink">Add a user</h2>

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

          <label className="block">
            <span className="field-label">Role</span>
            <select
              value={draft.role}
              onChange={(event) => setDraft({ ...draft, role: event.target.value as BackOfficeRole })}
              className="field-input"
            >
              <option value="STAFF">Staff</option>
              <option value="TAILOR">Tailor</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>

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

          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Creating…' : 'Add user'}
          </button>
        </form>
      </div>
    </>
  );
}
