'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BRAND } from '@newax/shared';
import { completeSsoSignIn } from '@/lib/admin-client';
import { landingFor } from '@/components/admin/nav-registry';
import { ROUTES } from '@/constants/routes';

const FAILED = 'Single sign-on did not complete. Try again, or sign in with your password.';

/**
 * Where the API's single sign-on callback lands a completed sign-in
 * (161-sso-identity-federation.md).
 *
 * The session is not in this URL. The callback left it in a sealed,
 * two-minute, httpOnly cookie, and `completeSsoSignIn()` redeems it — once —
 * for the same AuthResult a password sign-in returns, stored the same way,
 * before moving on into the admin app. A visit that did not come from a
 * callback finds nothing to redeem, and says so with a way back.
 */
export default function SsoCompletePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // The handoff can be redeemed once: React's development double-run of
  // effects must not spend it twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    completeSsoSignIn()
      .then((user) => router.replace(landingFor(user.permissions)))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : FAILED));
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">{BRAND.identity.adminName}</h1>

        {error ? (
          <>
            <p role="alert" className="notice notice-error mt-6 text-start">
              {error}
            </p>
            <Link href={ROUTES.admin.login} className="btn-primary mt-4 w-full">
              Back to sign in
            </Link>
          </>
        ) : (
          <p role="status" className="mt-2 text-sm text-neutral-900/60">
            Finishing single sign-on…
          </p>
        )}
      </div>
    </div>
  );
}
