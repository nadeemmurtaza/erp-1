'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { UserRole } from '@yaseen/shared';
import { login } from '@/lib/admin-client';
import { landingFor } from '@/components/admin/nav-registry';

export default function AdminLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const user = await login(identifier, password);
      // A tailor has no dashboard to read; send them straight to their queue.
      router.replace(landingFor(user.role as UserRole));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold text-brand-700">Yaseen Admin</h1>
        <p className="mt-1 text-center text-sm text-ink/60">
          Sign in to manage the catalogue and orders.
        </p>

        <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-6">
          <div>
            <label className="field-label" htmlFor="identifier">
              Email or phone
            </label>
            <input
              id="identifier"
              className="field-input"
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="field-input"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
