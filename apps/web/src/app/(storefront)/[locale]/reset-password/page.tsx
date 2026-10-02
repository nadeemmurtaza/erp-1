'use client';

import { useSearchParams } from 'next/navigation';
import { AuthPage } from '@/components/storefront/auth-page';
import { Button, Field, FormStack, SuccessState } from '@/components/ui';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { resetPassword } from '@/lib/customer-client';
import { ROUTES } from '@/constants/routes';

export default function ResetPasswordPage() {
  const t = useTranslations('passwordReset');
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  // A credential changed: the result is the page and it stays until the reader leaves (SUC-3). It used to redirect
  // after two seconds, which took the confirmation away before anyone could read it; the sign-in button is the way on.
  if (done) {
    return (
      <div className="flex min-h-auth items-center justify-center px-4 py-12">
        <SuccessState
          as="h1"
          focus
          linkAs={Link}
          title={t('successTitle')}
          detail={t('successDetail')}
          primary={{ label: t('signIn'), href: ROUTES.storefront.login }}
        />
      </div>
    );
  }

  return (
    <AuthPage title={t('title')}>

        {!token ? (
          <p role="alert" className="notice notice-error text-center">
            {t.rich('missingToken', {
              link: (chunks) => (
                <Link href={ROUTES.storefront.forgotPassword} className="font-medium underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        ) : (
          <FormStack
            onSubmit={onSubmit}
            className="mt-8"
            actions={
              <Button type="submit" loading={busy} loadingLabel={t('saving')} className="w-full">
                {t('submit')}
              </Button>
            }
          >
            <Field label={t('passwordLabel')} hint={t('passwordHint')}>
              {(control) => (
                <input
                  {...control}
                  type="password"
                  className="field-input field-xl"
                  autoComplete="new-password"
                  minLength={8}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              )}
            </Field>

            {error ? (
              <div role="alert" className="notice notice-error">
                <p>{error}</p>
                {/* The remedy (FLO-7): a link that is wrong or old is fixed by asking for another. */}
                <p className="mt-2">
                  <Link href={ROUTES.storefront.forgotPassword} className="font-medium underline">
                    {t('requestNew')}
                  </Link>
                </p>
              </div>
            ) : null}
          </FormStack>
        )}
    </AuthPage>
  );
}
