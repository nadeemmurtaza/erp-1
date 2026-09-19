'use client';

import Link from 'next/link';

/**
 * Catches a crash anywhere under the root layout (CLAUDE.md "No dead ends").
 * The layout itself still rendered, so globals.css is guaranteed and the
 * usual `.tap-btn` classes are safe here — unlike global-error.tsx, which
 * has no such guarantee and inlines its own styles instead.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">Something went wrong</h1>
        <p className="text-neutral-500">Try again, or head back to the till.</p>
        <button type="button" className="tap-btn" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="tap-btn-secondary">
          Back to till
        </Link>
        {error.digest ? <p className="text-sm text-neutral-400">Reference: {error.digest}</p> : null}
      </div>
    </main>
  );
}
