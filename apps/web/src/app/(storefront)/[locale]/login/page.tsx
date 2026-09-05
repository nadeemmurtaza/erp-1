'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { loginCustomer } from '@/lib/customer-client';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { ROUTES } from '@/constants/routes';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useCustomerSession();
  const tSite = useTranslations('site');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const user = await loginCustomer(identifier, password);
      setUser(user);
      const next = searchParams.get('next') ?? '/';
      router.push(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <div className="flex flex-1 items-center justify-center px-4 py-12 lg:px-8">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-2xl font-semibold text-accent-hover">Sign In</h1>
          <p className="mt-1 text-center text-sm text-neutral-900/60">
            Welcome back to {tSite('name')}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
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
              <div className="flex items-center justify-between">
                <label className="field-label" htmlFor="password">
                  Password
                </label>
                <Link href={ROUTES.storefront.forgotPassword} className="text-xs text-accent-hover hover:underline">
                  Forgot password?
                </Link>
              </div>
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
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-neutral-900/60">
            Don&apos;t have an account?{' '}
            <Link href={ROUTES.storefront.register} className="font-medium text-accent-hover hover:underline">
              Register here
            </Link>
          </div>
        </div>
      </div>
      <div className="hidden lg:flex lg:flex-1 relative bg-neutral-50 items-center justify-center p-12">
        <div className="max-w-lg text-center">
          <h2 className="text-4xl font-bold tracking-tight text-accent-hover">
            Welcome to {tSite('name')}
          </h2>
          <p className="mt-4 text-lg text-accent-hover/80">
            Sign in to track your orders, manage your custom stitching profiles, and checkout faster.
          </p>
        </div>
      </div>
    </div>
  );
}
