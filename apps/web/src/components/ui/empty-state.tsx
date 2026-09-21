import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * What a list shows when it has nothing in it.
 *
 * There were thirteen of these written by hand across admin, each phrasing it
 * differently and most offering no way out — "No orders match those filters"
 * and then nothing, leaving the reader to work out that the filter above is
 * the thing to change.
 *
 * An empty state has a job: say what would be here, and give the one action
 * that would put something here. The two cases are genuinely different and
 * the wording should be too — nothing exists yet (create one) versus nothing
 * matched (clear the filter) — so `action` is a slot rather than a guess.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  /** Why it is empty, or what would appear here. One line. */
  description?: ReactNode;
  /** The one thing that resolves it: create, or clear the filter. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-6 py-12 text-center', className)}>
      <p className="text-sm font-medium text-neutral-900">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-900/60">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
