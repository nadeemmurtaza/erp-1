import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * The top of every page: context, title, one line of explanation, and the one
 * primary action.
 *
 * This shape was written out by hand at thirty-nine call sites, which is why
 * it had drifted — different margins, some with a description and some
 * without, the action sometimes above the title and sometimes floating beside
 * the first card. More importantly it was thirty-nine chances to quietly put
 * a second primary button next to the first.
 *
 * `action` is singular on purpose. A page has one primary action; if a second
 * one is genuinely needed it is a secondary button inside the workspace, not
 * a peer up here. The prop being a single slot is the rule made mechanical.
 *
 * `context` is the breadcrumb or back link — where the reader came from, not
 * a navigation tree.
 */
export function PageHeader({
  title,
  description,
  context,
  action,
  className,
}: {
  title: ReactNode;
  /** One line. If it needs two, the page is doing two things. */
  description?: ReactNode;
  context?: ReactNode;
  /** The single primary action. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6', className)}>
      {context ? <div className="mb-2 text-sm text-neutral-900/60">{context}</div> : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-prose text-sm text-neutral-900/60">{description}</p>
          ) : null}
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
