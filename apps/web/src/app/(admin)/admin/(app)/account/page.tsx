'use client';

import { useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import { ROUTES } from '@/constants/routes';

export default function AdminAccountPage() {
  const { can, ...user } = useAdminSession();
  const canChangePassword = can('account.change_own_password');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);

    try {
      await adminFetch('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Password changed. You have been signed out of every other device.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change your password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">My account</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        {user?.firstName ?? user?.email} · {user?.roles.join(', ') || 'No role assigned'}
      </p>

      {canChangePassword ? (
        <form onSubmit={onSubmit} className="card max-w-sm space-y-4 p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Change password</h2>

          <label className="block">
            <span className="field-label">Current password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="field-input"
            />
          </label>

          <label className="block">
            <span className="field-label">New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="field-input"
            />
          </label>

          {error ? (
            <p role="alert" className="notice notice-error">
              {error}
            </p>
          ) : null}
          {message ? <p className="text-sm text-green-700">{message}</p> : null}

          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Changing…' : 'Change password'}
          </button>
        </form>
      ) : (
        <div className="card max-w-sm p-4 text-sm text-neutral-900/60">
          An admin has turned off self-service password changes for your account. Ask an admin
          to reset your password from Team &amp; Access.
        </div>
      )}

      <p className="mt-6 max-w-sm text-sm text-neutral-900/60">
        Connecting a script, an integration or an AI agent?{' '}
        <Link href={ROUTES.admin.accountApiKeys} className="font-medium text-accent-hover hover:underline">
          Manage your API keys
        </Link>
      </p>
    </>
  );
}
