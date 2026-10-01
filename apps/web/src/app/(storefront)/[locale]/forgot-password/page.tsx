'use client';

import { useState } from 'react';
import { AuthPage } from '@/components/storefront/auth-page';
import { Button, Field, FormStack } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { forgotPassword } from '@/lib/customer-client';
import { ROUTES } from '@/constants/routes';

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
    <AuthPage
      title="Reset your password"
      footer={
        <Link href={ROUTES.storefront.login} className="font-medium text-accent-hover hover:underline">
          Back to sign in
        </Link>
      }
    >

        {sent ? (
          <p className="notice notice-info text-center">
            If an account exists for {email}, we&apos;ve sent a link to reset your password. It
            expires in one hour.
          </p>
        ) : (
          <FormStack
            onSubmit={onSubmit}
            className="mt-8"
            actions={
              <Button type="submit" loading={busy} loadingLabel="Sending…" className="w-full">
                Send reset link
              </Button>
            }
          >
            <p className="text-center text-sm text-neutral-900/60">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
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

            {error ? (
              <p role="alert" className="notice notice-error">
                {error}
              </p>
            ) : null}
          </FormStack>
        )}

    </AuthPage>
  );
}
