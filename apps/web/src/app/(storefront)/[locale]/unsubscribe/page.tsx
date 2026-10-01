'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { DrawIcon } from '@/components/ui';
import { unsubscribeFromMarketing } from '@/lib/customer-client';

type Status = 'checking' | 'success' | 'error';

export default function UnsubscribePage() {
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
        setError(cause instanceof Error ? cause.message : 'Could not process this request');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [userId, token]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">Email preferences</h1>

        {status === 'checking' ? (
          <p className="mt-6 text-sm text-neutral-900/60">Updating your preferences…</p>
        ) : status === 'success' ? (
          <>
            {/* The tick is drawn as the page confirms: the result is the one thing here that just happened. */}
            <div className="mt-6 flex justify-center text-feedback-positive">
              <DrawIcon>
                <CircleCheck className="h-10 w-10" aria-hidden="true" />
              </DrawIcon>
            </div>
            <p className="mt-3 rounded-md bg-neutral-50 px-4 py-3 text-sm text-accent-hover">
              You&rsquo;re unsubscribed from marketing email. Order and account emails still reach
              you — those aren&rsquo;t marketing.
            </p>
          </>
        ) : (
          <p className="notice notice-error mt-6">
            {error ?? 'This unsubscribe link is missing its details.'}
          </p>
        )}

        <div className="mt-6 text-sm text-neutral-900/60">
          <Link href="/" className="font-medium text-accent-hover hover:underline">
            Back to the store
          </Link>
        </div>
      </div>
    </div>
  );
}
