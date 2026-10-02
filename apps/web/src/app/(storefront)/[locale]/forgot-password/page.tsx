'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AuthPage } from '@/components/storefront/auth-page';
import { Button, Field, FormStack } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { forgotPassword } from '@/lib/customer-client';
import { ROUTES } from '@/constants/routes';

export default function ForgotPasswordPage() {
  const t = useTranslations('forgotPassword');
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
      setError(cause instanceof Error ? cause.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage
      title={t('title')}
      footer={
        <Link href={ROUTES.storefront.login} className="font-medium text-accent-hover hover:underline">
          {t('backToSignIn')}
        </Link>
      }
    >

        {sent ? (
          <>
            <p role="status" className="notice notice-info text-center">{t('sent', { email })}</p>
            {/* A mistyped address ends here otherwise: the only way on is back out and in again (ITG-1). */}
            <p className="mt-4 text-center text-sm">
              <button
                type="button"
                onClick={() => setSent(false)}
                className="font-medium text-accent-hover hover:underline"
              >
                {t('useDifferent')}
              </button>
            </p>
          </>
        ) : (
          <FormStack
            onSubmit={onSubmit}
            className="mt-8"
            actions={
              <Button type="submit" loading={busy} loadingLabel={t('sending')} className="w-full">
                {t('submit')}
              </Button>
            }
          >
            <p className="text-center text-sm text-neutral-900/60">
              {t('intro')}
            </p>
            <Field label={t('emailLabel')}>
              {(control) => (
                <input
                  {...control}
                  type="email"
                  className="field-input field-xl"
                  autoComplete="email"
                  placeholder={t('emailPlaceholder')}
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
