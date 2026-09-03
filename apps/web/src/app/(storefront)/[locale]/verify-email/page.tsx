'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { verifyEmail } from '@/lib/customer-client';

type Status = 'checking' | 'success' | 'error';

export default function VerifyEmailPage() {
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
        setError(cause instanceof Error ? cause.message : 'Could not confirm your email address');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-brand-700">Email verification</h1>

        {status === 'checking' ? (
          <p className="mt-6 text-sm text-ink/60">Confirming your email address…</p>
        ) : status === 'success' ? (
          <p className="mt-6 rounded-md bg-brand-50 px-4 py-3 text-sm text-brand-800">
            Your email address is confirmed.
          </p>
        ) : (
          <p className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {error ?? 'This verification link is missing its token.'}
          </p>
        )}

        <div className="mt-6 text-sm text-ink/60">
          <Link href="/account" className="font-medium text-brand-700 hover:underline">
            Go to your account
          </Link>
        </div>
      </div>
    </div>
  );
}
