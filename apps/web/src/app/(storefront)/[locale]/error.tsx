'use client';

import { useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';

/**
 * Storefront error boundary.
 *
 * Without this file a thrown render error inside the locale segment reaches
 * Next's own fallback, which in production is an unstyled, unbranded page
 * with no way back into the shop — a customer's session simply ends there.
 * This keeps them inside the storefront and offers the two things that
 * actually recover: retry the segment, or go home.
 *
 * Scoped to the locale segment rather than the app root on purpose: the
 * header, footer and providers in the layout above stay mounted, so the
 * customer keeps their cart badge and navigation while only the failed page
 * body is replaced.
 */
export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side stack, which Next
    // deliberately withholds from the client in production.
    console.error('Storefront error:', error.digest ?? error.message);
  }, [error]);

  return (
    <main className="container-page flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="font-display text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Something went wrong
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold text-neutral-900 sm:text-4xl">
        This page didn&apos;t load
      </h1>
      <p className="mt-3 max-w-md text-sm text-neutral-500">
        The problem is on our side, not yours. Try again — if it keeps happening,
        your cart is safe and you can carry on browsing.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href={ROUTES.storefront.shop} className="btn-secondary">
          Back to shop
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-8 text-xs text-neutral-400">Reference: {error.digest}</p>
      ) : null}
    </main>
  );
}
