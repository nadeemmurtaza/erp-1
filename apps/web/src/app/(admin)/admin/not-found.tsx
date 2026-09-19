import Link from 'next/link';
import { ROUTES } from '@/constants/routes';

/** Admin 404 — a mistyped admin URL, or a record that no longer exists. */
export default function AdminNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="card w-full max-w-lg p-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-neutral-900/40">404</p>
        <h1 className="mt-2 text-lg font-semibold text-neutral-900">Screen not found</h1>
        <p className="mt-2 text-sm text-neutral-900/60">
          This page does not exist, or the record it pointed at has been removed.
        </p>
        <Link href={ROUTES.admin.dashboard} className="btn-primary mt-5 inline-flex">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
