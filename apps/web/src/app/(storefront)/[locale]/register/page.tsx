'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { registerCustomer } from '@/lib/customer-client';
import { useCustomerSession } from '@/components/storefront/customer-session';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useCustomerSession();
  const tSite = useTranslations('site');

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const user = await registerCustomer({
        email,
        phone: phone || undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        password,
      });
      setUser(user);
      const next = searchParams.get('next') ?? '/';
      router.push(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Registration failed');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <div className="flex flex-1 items-center justify-center px-4 py-12 lg:px-8">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-2xl font-semibold text-brand-700">Create Account</h1>
          <p className="mt-1 text-center text-sm text-ink/60">
            Join {tSite('name')} today
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label" htmlFor="firstName">
                  First Name
                </label>
                <input
                  id="firstName"
                  className="field-input"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="lastName">
                  Last Name
                </label>
                <input
                  id="lastName"
                  className="field-input"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>
            </div>

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

            <div>
              <label className="field-label" htmlFor="phone">
                Phone (Optional)
              </label>
              <input
                id="phone"
                type="tel"
                className="field-input"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
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
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
            </div>

            {error ? (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Creating account…' : 'Register'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-ink/60">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-brand-700 hover:underline">
              Sign in here
            </Link>
          </div>
        </div>
      </div>
      <div className="hidden lg:flex lg:flex-1 relative bg-brand-50 items-center justify-center p-12">
        <div className="max-w-lg text-center">
          <h2 className="text-4xl font-bold tracking-tight text-brand-800">
            Start your journey
          </h2>
          <p className="mt-4 text-lg text-brand-700/80">
            Create an account to save your favorite pieces, manage your measurements, and get exclusive access to our latest collections.
          </p>
        </div>
      </div>
    </div>
  );
}
