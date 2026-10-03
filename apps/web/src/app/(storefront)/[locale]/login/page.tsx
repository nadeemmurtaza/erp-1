'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { AuthPage } from '@/components/storefront/auth-page';
import { Button, Field, FormStack } from '@/components/ui';
import { useDoneBeat } from '@/hooks/use-done-beat';
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
  const { done, finish } = useDoneBeat();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const user = await loginCustomer(identifier, password);
      setUser(user);
      await finish();
      const next = searchParams.get('next') ?? '/';
      router.push(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed');
      setBusy(false);
    }
  }

  return (
    <AuthPage
      title="Sign In"
      description={`Welcome back to ${tSite('name')}`}
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href={ROUTES.storefront.register} className="font-medium text-accent-hover hover:underline">
            Register here
          </Link>
        </>
      }
      aside={
        <>
          <h2 className="text-4xl font-bold tracking-tight text-neutral-900">
            Welcome to {tSite('name')}
          </h2>
          <p className="mt-4 text-lg text-accent-hover/80">
            Sign in to track your orders, manage your custom stitching profiles, and checkout
            faster.
          </p>
        </>
      }
    >

          <FormStack
            onSubmit={onSubmit}
            className="mt-8"
            actions={
              <>
                <Button type="submit" loading={busy} loadingLabel="Signing in…" done={done} doneLabel="Signed in" className="w-full">
                  Sign In
                </Button>
                <Link href={ROUTES.storefront.forgotPassword} className="text-center text-sm text-accent-hover hover:underline">
                  Forgot password?
                </Link>
              </>
            }
          >
            <Field label="Email or phone">
              {(control) => (
                <input
                  {...control}
                  className="field-input field-xl"
                  autoComplete="username"
                  placeholder="you@example.com"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                />
              )}
            </Field>

            <Field label="Password">
              {(control) => (
                <input
                  {...control}
                  type="password"
                  className="field-input field-xl"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              )}
            </Field>

            {error ? (
              <p role="alert" className="notice notice-error">
                {error}
              </p>
            ) : null}
          </FormStack>

    </AuthPage>
  );
}
