'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ROUTES } from '@/constants/routes';

/**
 * Admin error boundary.
 *
 * Staff-facing, so this one shows the error message rather than hiding it —
 * whoever hits this can act on "Failed to fetch" or a 403 directly, and it
 * saves a round trip through the browser console when reporting a problem.
 * The storefront's equivalent deliberately does the opposite.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="card w-full max-w-lg p-6">
        <h1 className="text-lg font-semibold text-neutral-900">This screen failed to load</h1>
        <p className="mt-2 text-sm text-neutral-900/60">
          The action did not complete. Retrying is safe — nothing was saved.
        </p>

        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-md bg-red-50 p-3 text-xs text-red-700">
          {error.message}
          {error.digest ? `\n\nReference: ${error.digest}` : ''}
        </pre>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link href={ROUTES.admin.dashboard} className="btn-secondary">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
