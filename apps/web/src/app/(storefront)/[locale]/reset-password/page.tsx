'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { AuthPage } from '@/components/storefront/auth-page';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { resetPassword } from '@/lib/customer-client';
import { ROUTES } from '@/constants/routes';

export default function ResetPasswordPage() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reset your password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage title="Choose a new password">

        {!token ? (
          <p role="alert" className="notice notice-error text-center">
            This link is missing its reset token. Request a new one from the{' '}
            <Link href={ROUTES.storefront.forgotPassword} className="font-medium underline">
              password reset page
            </Link>
            .
          </p>
        ) : done ? (
          <p className="mt-6 rounded-md bg-neutral-50 px-4 py-3 text-center text-sm text-accent-hover">
            Your password has been reset. Redirecting you to sign in…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="field-label" htmlFor="newPassword">
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                className="field-input"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </div>

            {error ? (
              <p role="alert" className="notice notice-error">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}
    </AuthPage>
  );
}
