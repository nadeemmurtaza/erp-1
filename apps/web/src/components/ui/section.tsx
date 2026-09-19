import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * A titled region of a page, with no box around it.
 *
 * The audit found twelve bordered cards on the admin dashboard, ten on the
 * order detail page and nine on reports. Most were not containing anything —
 * they were a heading and some content that someone put a border around
 * because every other group had one. Repeated a dozen times that reads as
 * clutter, not structure.
 *
 * A border should mean something: this is a distinct object, or you can
 * interact with it. Grouping is what whitespace and alignment are for. So
 * this is a heading, an optional line of explanation, an optional action, and
 * the content — and `card` remains available for the cases where a boundary
 * genuinely communicates one.
 */
export function Section({
  title,
  description,
  action,
  children,
  className,
  headingLevel: Heading = 'h2',
}: {
  title?: ReactNode;
  /** One line, only when the title is not self-explanatory. */
  description?: ReactNode;
  /** A secondary action scoped to this section, never the page's primary one. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** h2 by default; drop to h3 when nested under another Section. */
  headingLevel?: 'h2' | 'h3';
}) {
  return (
    <section className={cn('mb-10 last:mb-0', className)}>
      {title || action ? (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            {title ? (
              <Heading className="text-sm font-semibold uppercase tracking-wide text-neutral-900/50">
                {title}
              </Heading>
            ) : null}
            {description ? (
              <p className="mt-1 max-w-prose text-sm text-neutral-900/60">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}

      {children}
    </section>
  );
}
