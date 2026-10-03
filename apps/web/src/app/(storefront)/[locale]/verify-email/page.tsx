'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button, SuccessState } from '@/components/ui';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { resendEmailVerification, verifyEmail } from '@/lib/customer-client';
import { ROUTES } from '@/constants/routes';

type Status = 'checking' | 'success' | 'error';
type Resend = 'idle' | 'sending' | 'sent' | 'failed';

export default function VerifyEmailPage() {
  const t = useTranslations('verifyEmail');
  const token = useSearchParams().get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'checking' : 'error');
  const [error, setError] = useState<string | null>(null);
  const [resend, setResend] = useState<Resend>('idle');
  const { user } = useCustomerSession();

  async function onResend() {
    setResend('sending');
    try {
      await resendEmailVerification();
      setResend('sent');
    } catch {
      setResend('failed');
    }
  }

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    verifyEmail(token)
      .then(() => {
        if (!cancelled) setStatus('success');
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : null);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // The result is the whole page (SUC-3: a record was changed and the link that did it will not be opened twice),
  // so it is the page's own heading and it stays until the reader leaves.
  if (status === 'success') {
    return (
      <div className="flex min-h-auth items-center justify-center px-4 py-12">
        <SuccessState
          as="h1"
          focus
          linkAs={Link}
          title={t('successTitle')}
          detail={t('successDetail')}
          primary={{ label: t('toAccount'), href: ROUTES.storefront.account }}
          back={{ label: t('backToStore'), href: ROUTES.storefront.home }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-auth items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">{t('title')}</h1>

        {status === 'checking' ? (
          <p role="status" className="mt-6 text-sm text-neutral-900/60">{t('checking')}</p>
        ) : (
          <>
            <p role="alert" className="notice notice-error mt-6">
              {error ?? (token ? t('failed') : t('missingToken'))} {t('failedHint')}
            </p>

            {/* The remedy (FLO-7): a new link, from the person's own session, or a way to get one. */}
            <div className="mt-6">
              {user ? (
                resend === 'sent' ? (
                  <p role="status" className="text-sm text-neutral-900/70">{t('resent')}</p>
                ) : (
                  <>
                    <Button
                      type="button"
                      onClick={onResend}
                      loading={resend === 'sending'}
                      loadingLabel={t('resending')}
                      className="w-full"
                    >
                      {t('resend')}
                    </Button>
                    {resend === 'failed' ? (
                      <p role="alert" className="notice notice-error mt-3">{t('resendFailed')}</p>
                    ) : null}
                  </>
                )
              ) : (
                <Link
                  href={`${ROUTES.storefront.login}?next=${encodeURIComponent(ROUTES.storefront.account)}`}
                  className="btn btn-primary w-full"
                >
                  {t('signInToResend')}
                </Link>
              )}
            </div>
          </>
        )}

        <div className="mt-6 text-sm text-neutral-900/60">
          <Link href={ROUTES.storefront.account} className="font-medium text-accent-hover hover:underline">
            {t('toAccount')}
          </Link>
        </div>
      </div>
    </div>
  );
}
