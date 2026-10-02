'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SuccessState } from '@/components/ui';
import { verifyEmail } from '@/lib/customer-client';
import { ROUTES } from '@/constants/routes';

type Status = 'checking' | 'success' | 'error';

export default function VerifyEmailPage() {
  const t = useTranslations('verifyEmail');
  const token = useSearchParams().get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'checking' : 'error');
  const [error, setError] = useState<string | null>(null);

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
          <p className="mt-6 text-sm text-neutral-900/60">{t('checking')}</p>
        ) : (
          <p className="notice notice-error mt-6">{error ?? (token ? t('failed') : t('missingToken'))}</p>
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
