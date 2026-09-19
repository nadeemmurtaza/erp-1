import Link from 'next/link';

/**
 * Unmatched URL on a till device — renders inside the root layout, so
 * globals.css is guaranteed (CLAUDE.md "No dead ends").
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">404</p>
        <h1 className="text-2xl font-semibold text-neutral-900">We couldn&apos;t find that page</h1>
        <p className="text-neutral-500">The address may be mistyped, or the page may have moved.</p>
        <Link href="/" className="tap-btn">
          Back to till
        </Link>
      </div>
    </main>
  );
}
