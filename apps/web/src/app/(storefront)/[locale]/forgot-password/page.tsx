'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { forgotPassword } from '@/lib/customer-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await forgotPassword(email);
      // Always show the same success state whether or not the address is
      // registered — the API already behaves this way, so the page must too,
      // or the "no such account" case would leak through a different UI path.
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold text-brand-700">Reset your password</h1>

        {sent ? (
          <p className="mt-6 rounded-md bg-brand-50 px-4 py-3 text-center text-sm text-brand-800">
            If an account exists for {email}, we&apos;ve sent a link to reset your password. It
            expires in one hour.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <p className="text-center text-sm text-ink/60">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
            <div>
              <label className="field-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="field-input"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            {error ? (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-ink/60">
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
