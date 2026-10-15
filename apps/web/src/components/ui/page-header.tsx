'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { IconTile } from './icon-tile';
import { usePageIdentity } from './page-identity';

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
 *
 * A page's own `h1` wears the tile of the part of the product it belongs to (the glyph and tone
 * of its nav group, from `PageIdentityProvider`): which kind of page this is, before the title is
 * read. Only the page's one `h1`; a header inside a larger page (`headingLevel` below `h1`) is a
 * section and has none.
 */
export function PageHeader({
  title,
  description,
  context,
  action,
  className,
  headingLevel: Heading = 'h1',
}: {
  title: ReactNode;
  /** One line. If it needs two, the page is doing two things. */
  description?: ReactNode;
  context?: ReactNode;
  /** The single primary action. */
  action?: ReactNode;
  className?: string;
  /** h1 on a page of its own. Drop it where the header sits inside a larger page, such as a specimen in the gallery. */
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4';
}) {
  const identity = usePageIdentity();
  const tile = Heading === 'h1' ? identity : null;
  return (
    <header className={cn('mb-6', className)}>
      {context ? <div className="mb-2 text-sm text-neutral-900/60">{context}</div> : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {tile ? <IconTile icon={tile.icon} tone={tile.tone} size="lg" /> : null}
          <div className="min-w-0">
            <Heading className="text-xl font-semibold text-neutral-900">{title}</Heading>
            {description ? (
              <p className="mt-1 max-w-prose text-sm text-neutral-900/60">{description}</p>
            ) : null}
          </div>
        </div>

        {action ? <div className="max-w-full">{action}</div> : null}
      </div>
    </header>
  );
}
