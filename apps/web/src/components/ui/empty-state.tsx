import { Inbox } from 'lucide-react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { cn } from '@/utils/cn';
import type { ToneName } from '@/lib/tone';
import { IconTile } from './icon-tile';

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
  icon = Inbox,
  tone = 'sky',
  className,
}: {
  title: ReactNode;
  /** Why it is empty, or what would appear here. One line. */
  description?: ReactNode;
  /** The one thing that resolves it: create, or clear the filter. */
  action?: ReactNode;
  /** The glyph on the tile above the title. A tray by default; pass `null` where the title stands alone. */
  icon?: ComponentType<SVGProps<SVGSVGElement>> | null;
  /** The tile's tone. Sky by default: calm, and nothing here is good or bad. */
  tone?: ToneName;
  className?: string;
}) {
  return (
    <div className={cn('px-6 py-12 text-center', className)}>
      {icon ? <IconTile icon={icon} tone={tone} size="lg" className="mb-3" /> : null}
      <p className="text-sm font-medium text-neutral-900">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-900/60">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
