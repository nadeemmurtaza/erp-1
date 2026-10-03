'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { AuthPage } from '@/components/storefront/auth-page';
import { Button, Field, FormStack } from '@/components/ui';
import { useDoneBeat } from '@/hooks/use-done-beat';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { registerCustomer } from '@/lib/customer-client';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { ROUTES } from '@/constants/routes';

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
  const { done, finish } = useDoneBeat();

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
      await finish();
      const next = searchParams.get('next') ?? '/';
      router.push(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Registration failed');
      setBusy(false);
    }
  }

  return (
    <AuthPage
      title="Create Account"
      description={`Join ${tSite('name')} today`}
      footer={
        <>
          Already have an account?{' '}
          <Link href={ROUTES.storefront.login} className="font-medium text-accent-hover hover:underline">
            Sign in here
          </Link>
        </>
      }
      aside={
        <>
          <h2 className="text-4xl font-bold tracking-tight text-neutral-900">Start your journey</h2>
          <p className="mt-4 text-lg text-accent-hover/80">
            Create an account to save your favorite pieces, manage your measurements, and get
            exclusive access to our latest collections.
          </p>
        </>
      }
    >

          <FormStack
            onSubmit={onSubmit}
            className="mt-8"
            actions={
              <Button type="submit" loading={busy} loadingLabel="Creating account…" done={done} doneLabel="Account created" className="w-full">
                Register
              </Button>
            }
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name">
                {(control) => (
                  <input
                    {...control}
                    className="field-input field-xl"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Last Name">
                {(control) => (
                  <input
                    {...control}
                    className="field-input field-xl"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                )}
              </Field>
            </div>

            <Field label="Email">
              {(control) => (
                <input
                  {...control}
                  type="email"
                  className="field-input field-xl"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              )}
            </Field>

            <Field label="Phone (Optional)">
              {(control) => (
                <input
                  {...control}
                  type="tel"
                  className="field-input field-xl"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              )}
            </Field>

            <Field label="Password" hint="At least 8 characters.">
              {(control) => (
                <input
                  {...control}
                  type="password"
                  className="field-input field-xl"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
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
