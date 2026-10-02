'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SuccessState } from '@/components/ui';
import { unsubscribeFromMarketing } from '@/lib/customer-client';
import { ROUTES } from '@/constants/routes';

type Status = 'checking' | 'success' | 'error';

export default function UnsubscribePage() {
  const t = useTranslations('unsubscribe');
  const params = useSearchParams();
  const userId = params.get('u') ?? '';
  const token = params.get('t') ?? '';
  const [status, setStatus] = useState<Status>(userId && token ? 'checking' : 'error');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !token) return;

    let cancelled = false;
    unsubscribeFromMarketing(userId, token)
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
  }, [userId, token]);

  // A preference on the person's record changed from a link in an email: the result is the page, and it stays.
  if (status === 'success') {
    return (
      <div className="flex min-h-auth items-center justify-center px-4 py-12">
        <SuccessState
          as="h1"
          focus
          linkAs={Link}
          title={t('successTitle')}
          detail={t('successDetail')}
          primary={{ label: t('backToStore'), href: ROUTES.storefront.home }}
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
          <p className="notice notice-error mt-6">{error ?? (userId && token ? t('failed') : t('missingDetails'))}</p>
        )}

        <div className="mt-6 text-sm text-neutral-900/60">
          <Link href={ROUTES.storefront.home} className="font-medium text-accent-hover hover:underline">
            {t('backToStore')}
          </Link>
        </div>
      </div>
    </div>
  );
}
